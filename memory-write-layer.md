---
title: "Memory Write Layer"
description: "System design of the memory writing pipeline — from add() to durable storage in PostgreSQL and Qdrant."
---

# Memory Writing Layer — System Design

> Generated from `memory-api` source. Covers the full path from an `add()` call to durable storage in PostgreSQL and Qdrant.

---

## 1. OverviewMermaid diagrams (the best option)

The memory write layer is a **queue-first async pipeline**. The HTTP request returns quickly with a `job_id`. All heavy work — extraction, conflict resolution, vector indexing, and domain overlays — runs in a Celery worker.

```mermaid
flowchart TD
    Client([Client SDK / HTTP]) --> ADD["POST /v1/memories/add\nFastAPI router"]

    ADD --> IDEM{Idempotency\nkey present?}
    IDEM -->|yes, cached| REPLAY[Return cached response]
    IDEM -->|no| GATE

    subgraph GATE["Quality Gate  (sync)"]
        L1[L1 — Per-user rate limit\nRedis counter, 1-min window]
        L2[L2 — Quality score < 0.35\nmessage length · lexical diversity]
        L3[L3 — Semantic duplicate > 0.92\ncosine similarity vs recent queries]
        L4[L4 — Budget governance\nmonthly calls / tokens]
        L1 --> L2 --> L3 --> L4
    end

    GATE -->|blocked| BLOCK[Return 200\nstatus: L1/L2/L3/L4]
    GATE -->|passed| PROXY[Proxy user resolve\nget or create ProxyUser row]
    PROXY --> QUEUE[Queue ExtractionJob\nCelery dispatch]
    QUEUE --> RESP[Return MemoryAddResponse\njob_id · status=queued · processing_eta]

    QUEUE -.->|async worker| CELERY

    subgraph CELERY["Celery Worker — process_extraction_job()"]
        CTX[Load existing memories\ntop 50 by importance for context]
        CTX --> EXT

        subgraph EXT["ExtractionService.extract()"]
            PREPASS{4+ messages\n2+ signal groups?}
            PREPASS -->|yes| COMP[Pass 1 — Compositional\nentity + relationship hints]
            PREPASS -->|no| MAIN
            COMP --> MAIN[Pass 2 — Main LLM extraction\nspec-driven prompt · JSON output]
            MAIN --> SPLIT[Split by confidence]
            SPLIT -->|≥ 0.65| KEPT[kept]
            SPLIT -->|0.45–0.64| PEND[pending]
            SPLIT -->|< 0.45| DISC[discarded]
        end

        PEND --> PCAND[Pending candidates\nfingerprint dedup · reinforce count\npromote at count ≥ 2]
        PCAND -->|promoted| KEPT

        KEPT --> CONFLICT

        subgraph CONFLICT["ConflictResolver.check_and_store()"]
            EMBED[Embed new memories]
            EMBED --> VSEARCH[Vector search Qdrant\nfind similar existing memories]
            VSEARCH --> RESOLVE{Resolution}
            RESOLVE -->|UPDATE| UPD[Archive old · store new\nprevious_version_id set]
            RESOLVE -->|MERGE| MRG[Store merged · archive old]
            RESOLVE -->|KEEP_BOTH| BOTH[Store both]
            RESOLVE -->|REJECT| REJ[Discard new]
            RESOLVE -->|NEW| NEW[Store as new memory]
            UPD & MRG & BOTH & NEW --> PG[(PostgreSQL\nMemory rows)]
            UPD & MRG & BOTH & NEW --> QD[(Qdrant\nvector index)]
            UPD & MRG --> VER[(MemoryVersion\nappend-only history)]
        end

        PG --> DOM[Domain overlay\nEdTech / Support]
        DOM --> CACHE[Invalidate hot-tier\ndelete Redis user key]
        CACHE --> DONE[Mark job completed\nupdate Redis job status]
    end

    style BLOCK fill:#fca5a5,color:#000
    style REPLAY fill:#fde68a,color:#000
    style RESP fill:#86efac,color:#000
    style DISC fill:#d1d5db,color:#000
    style REJ fill:#d1d5db,color:#000
```

---

## 2. Entry Point — `POST /v1/memories/add`

**File:** `api/routers/memories.py`

### Step 1 — Idempotency check

If the request includes an `Idempotency-Key` header, the router checks Redis for a previously cached response for that `(tenant_id, idempotency_key)` pair. A cache hit replays the original response without re-running any logic.

### Step 2 — Quality Gate

`QualityGateService.check()` runs synchronously before any database write. Four sequential layers:

| Layer | Check | Block reason |
| --- | --- | --- |
| L1 | Per-user rate limit (Redis counter, 1-min window) | `rate_limit_exceeded` |
| L2 | Conversation quality score < `0.35` | `low_quality` |
| L3 | Semantic cosine similarity > `0.92` against recent queries | `duplicate_query` |
| L4 | Budget governance (monthly calls / tokens) | `budget_exhausted` |

A blocked request returns HTTP `200` with `status: "L1"` / `"L2"` / `"L3"` / `"L4"`. The LLM call is never blocked by a gate failure.

**Quality score formula** (L2):
```
score = (message_count_score × 0.25)
      + (avg_length_score   × 0.30)
      + (lexical_diversity  × 0.25)
      + (question_signal    × 0.20)
```

**Semantic deduplication** (L3):
- Embeds the incoming conversation text
- Compares cosine similarity against the last 5 query embeddings stored in Redis per user
- Conflicting salient entities (acronyms, numbers, subject-like tokens) bypass the similarity check — a new exam name or score is never treated as a duplicate

Registered backend events (`payload.source` present) skip L3 entirely — legitimate service events look similar by design.

### Step 3 — Proxy user resolve

`ProxyUserService.resolve()` maps `(tenant_id, external_user_id)` → a `ProxyUser` row in PostgreSQL. Creates the row on first encounter.

### Step 4 — Queue the job

`MemoryService.queue_memory_add()` creates an `ExtractionJob` row and dispatches `process_extraction_job` to Celery. The router reads the queue ETA from Redis to set `processing_eta_seconds` and the `X-MemoryOS-Processing` response header.

---

## 3. Quality Gate Detail

**File:** `api/services/quality_gate.py`

```mermaid
flowchart TD
    IN["QualityGateService.check()\nmessages · tenant_id · external_user_id"]

    IN --> BG[BudgetGovernor.get_tenant_budget\n→ TenantBudget row]
    BG --> PCT[budget_remaining_pct\n→ float for response envelope]

    PCT --> CL1[_get_redis_count\nrate_key per user per minute]
    CL1 -->|count >= limit| RL1[❌ L1 blocked\nrate_limit_exceeded\nretry_after_seconds]
    CL1 -->|ok| CL2

    CL2[_conversation_quality_score\nmessage count · length · lexical diversity · question signal]
    CL2 -->|score < 0.35| RL2[❌ L2 blocked\nlow_quality]
    CL2 -->|score ok| CL3

    CL3{semantic_deduplication\nenabled?}
    CL3 -->|yes| SEM[_semantic_deduplication\ncosine sim vs last 5 queries in Redis]
    SEM -->|sim > 0.92| RL3[❌ L3 blocked\nduplicate_query]
    SEM -->|ok| CL4
    CL3 -->|no — backend event| CL4

    CL4[BudgetGovernor.evaluate\nmonthly calls + token budget]
    CL4 -->|budget exhausted| RL4[❌ L4 blocked\nbudget_exhausted]
    CL4 -->|ok| PASS

    PASS[✅ Passed]
    PASS --> INC[_increment_rate_counter\nRedis incr + expire]
    INC --> USG[dispatch_usage_increment\nqueue token usage update]
    USG --> LOG

    RL1 & RL2 & RL3 & RL4 --> LOG[_log_quality_result\nCallQualityLog row in PostgreSQL]

    style RL1 fill:#fca5a5,color:#000
    style RL2 fill:#fca5a5,color:#000
    style RL3 fill:#fca5a5,color:#000
    style RL4 fill:#fca5a5,color:#000
    style PASS fill:#86efac,color:#000
```

> Redis failures are caught and circuit-breaker-guarded. A Redis outage skips L1 and L3 rather than blocking the request.

---

## 4. Celery Pipeline — `process_extraction_job`

**File:** `api/tasks/extraction_tasks.py`

The task entry point is `process_extraction_job(job_payload)`. It calls `run_extraction_pipeline()` which does the real work.

### Retry logic

```mermaid
flowchart TD
    TASK["process_extraction_job(job_payload)"]
    TASK --> SETPROC[Mark job processing\nPostgreSQL + Redis]
    SETPROC --> RUN[run_extraction_pipeline]

    RUN -->|success| SETDONE[Mark job completed\nPostgreSQL + Redis]
    RUN -->|exception| ERR[Capture error + classify\nerror_type]

    ERR --> ATTEMPTS{attempts >= max 3?}
    ATTEMPTS -->|yes — dead| DL[DeadLetterJob row\nSentry alert\nreturn failed payload]
    ATTEMPTS -->|no — retry| SCHED["apply_async with countdown\n60s × attempt_number"]
    SCHED -->|dispatch ok| RETPAY[return payload\n_retain_queue_slot=true]
    SCHED -->|dispatch fails| FORCE[_force_dead_letter_job\nDead + Sentry]

    style DL fill:#fca5a5,color:#000
    style FORCE fill:#fca5a5,color:#000
    style SETDONE fill:#86efac,color:#000
    style RETPAY fill:#fde68a,color:#000
```

### Pipeline steps inside `run_extraction_pipeline()`

#### 4a. Load context

```python
existing_memories = _load_existing_memories_for_context(session, proxy_user_id)
# Top 50 non-archived memories ordered by importance_score DESC
# Passed to extractor so it avoids re-extracting what's already known
```

#### 4b. Source event context

If the job has a `source_event_id` and `source.explicit = True`, the pipeline builds a provenance snapshot to pass to the extractor, enabling "authenticated service event mode."

#### 4c. Extraction — `ExtractionService.extract_sync()`

**File:** `api/services/extraction_service.py`

Two-pass extraction for complex conversations:

**Pass 1 — Compositional pre-pass** (conditional):

Triggered when the conversation has ≥ 4 messages, ≥ 240 chars, ≥ 2 user turns, and ≥ 2 signal groups (identity, team, project, goal, preference, timeline). Makes a fast LLM call to find entities and cross-message relationships. Output is appended to the main extraction prompt as hints.

**Pass 2 — Main extraction**:

```
System prompt built from extraction_spec.md:
  - Category definitions
  - Importance rubric (1–10 scale)
  - Never-store rules
  - Confidence thresholds

LLM returns:
  {
    "memories": [
      { "content", "category", "importance_score", "confidence", "reasoning" }
    ],
    "nothing_to_extract": bool,
    "extraction_notes": string
  }
```

**Confidence thresholds:**

| Confidence | Outcome |
| --- | --- |
| ≥ 0.65 | `kept` — goes to conflict resolver immediately |
| 0.45–0.64 | `pending` — held in `PendingExtractionCandidate` table |
| < 0.45 | Discarded |

**Additional filters on each candidate:**
- `importance_score` must be ≥ 2.0
- Category must be in `{preference, fact, goal, procedure, relationship, expertise}`
- Content length: 10–500 chars
- Temporary session memory patterns are rejected (regex: "current debugging session", "next terminal command", etc.)

**Multi-provider fallback:**

`LLMService` tries providers in configured order (`LLM_PROVIDER_ORDER=gemini,openai,anthropic`). A circuit breaker per provider handles 5xx / timeout / rate-limit failures with automatic fallthrough.

#### 4d. Pending candidate management

```mermaid
flowchart TD
    CAND[Pending candidate\nconfidence 0.45–0.64]
    CAND --> FP["Fingerprint\nSHA-256(category + normalized content)"]

    FP --> EXACT{Exact fingerprint\nmatch in DB?}
    EXACT -->|yes, same polarity| REINF[reinforce_count + 1\nupdate content + confidence]
    EXACT -->|yes, conflict polarity| NEWROW2[New row\nconflict fingerprint]
    EXACT -->|no| SIMQ

    SIMQ{Similar candidate\nin same category?\nsimilarity > 0.82}
    SIMQ -->|yes, same polarity| REINF
    SIMQ -->|no| NEWROW[New PendingExtractionCandidate row\nreinforcement_count = 1]

    REINF --> PROMOTE{reinforcement_count >= 2\nor confidence >= 0.65?}
    PROMOTE -->|yes| STATUS[status = promoted\n→ ExtractedMemory\n→ ConflictResolver]
    PROMOTE -->|no| WAIT2[Stay pending\nwaiting for next add]

    style STATUS fill:#86efac,color:#000
    style WAIT2 fill:#fde68a,color:#000
```

#### 4e. Conflict resolution — `ConflictResolver.check_and_store()`

**File:** `api/services/conflict_resolver.py`

For each extracted memory:
1. Embed with `EmbeddingService`
2. Vector search in Qdrant for semantically similar existing memories
3. Classify the conflict
4. Apply resolution:

| Resolution | What happens |
| --- | --- |
| `UPDATE` | Old memory archived, new memory stored, `previous_version_id` set |
| `MERGE` | Combined memory stored, old archived |
| `KEEP_BOTH` | Both memories stored (different time context or both valid) |
| `REJECT` | New memory discarded (duplicate or lower quality) |
| `NEW` | No conflict found — memory stored as new |

Every change is recorded in `MemoryVersion` (append-only). Cross-user conflicts (shared facts) use recency and confidence weighting. Personal conflicts route to `ClarificationQueue` for the user to resolve at next session.

Domain-aware conflict routing:

- EdTech: personal student facts → `ClarificationQueue`; institutional facts → tenant dashboard review
- Support: similar routing for customer vs. workspace facts

#### 4f. Vector storage

Each stored memory gets an embedding written to Qdrant (`memories` collection). The embedding model and dimensions are configurable (`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`).

A `vector_sync_outbox` table catches any Qdrant write failures for async repair.

#### 4g. Domain schema overlay

Runs **after** general extraction and conflict resolution.

```mermaid
flowchart TD
    OVERLAY["_run_domain_schema_overlay()"]
    OVERLAY --> WHICH["_tenant_domain_schema()\nread tenant metadata_json"]

    WHICH -->|null| SKIP[Skip — general engine only]
    WHICH -->|edtech| ED["EdTech.extract_overlay_sync()\nupsert edtech_memories\ngrade · board · weak_topics\nexams · forgetting_stages\nlearner_type · language_profile"]
    WHICH -->|support| SUP["Support.extract_overlay_sync()\nupsert support_memories\ncurrent_issue · sentiment\nescalation_risk · pii-redacted fields\ncommunication_preference"]

    ED --> CMT[session.commit]
    SUP --> CMT
    CMT --> CONT[Continue pipeline\ngeneral memories already committed]

    SKIP --> CONT

    OVERLAY -.->|exception| WARN[Log warning\nDO NOT rollback general memories]
```

> Domain overlay failures are isolated — the general memories already committed are never rolled back.

#### 4h. Hot-tier cache invalidation

After commit, `_invalidate_proxy_user_cache(proxy_user_id)` deletes the Redis hot-memories key for the user (`user:{proxy_user_id}:hot_memories`). The next retrieval will rebuild from PostgreSQL + Qdrant.

#### 4i. Job status tracking

- PostgreSQL `ExtractionJob` row tracks `status`, `attempts`, `memories_created`, `completed_at`, `dead_lettered_at`
- Redis key `job:{job_id}:status` tracks live status for fast `GET /jobs/{job_id}` polling (TTL 1 hour)

---

## 5. Data Written per Successful `add()`

```mermaid
flowchart LR
    ADD["add() call"] --> PG

    subgraph PG["PostgreSQL"]
        EJ[(extraction_jobs\none row per add)]
        PU[(proxy_users\ncreated on first add)]
        CV[(conversations\nlinks memories to source)]
        MEM[(memories\none row per extracted memory)]
        MV[(memory_versions\nappend-only change history)]
        PC[(pending_extraction_candidates\nborderline memories)]
        CQ[(call_quality_log\ngate outcome per call)]
        ET[(edtech_memories\nif domain = edtech)]
        SP[(support_memories\nif domain = support)]
    end

    subgraph QD["Qdrant"]
        VEC[(memories collection\none vector per stored memory)]
        OUT[(vector_sync_outbox\nfailed writes queued for repair)]
    end

    subgraph RD["Redis"]
        RC[(rate counter\nper user per minute)]
        RQ[(recent query list\nlast 5 embeddings per user)]
        JS[(job status key\nTTL 1 hour)]
        HT[(hot-tier key\ninvalidated after write)]
    end

    ADD --> EJ & PU & CV & MEM & MV & PC & CQ
    ADD -.->|domain = edtech| ET
    ADD -.->|domain = support| SP
    ADD --> VEC
    ADD --> RC & RQ & JS & HT
```

---

## 6. Queue Architecture

**File:** `api/tasks/queue_router.py`

Tenants are routed to different Celery queues based on plan tier:

| Plan | Queue |
| --- | --- |
| Enterprise | `extraction_priority` |
| Growth | `extraction_standard` |
| Free / Starter | `extraction_bulk` |

```mermaid
flowchart LR
    JOB[New extraction job] --> PLAN{Plan tier}
    PLAN -->|Enterprise| PQ[extraction_priority]
    PLAN -->|Growth| SQ[extraction_standard]
    PLAN -->|Free / Starter| BQ[extraction_bulk]

    PQ & SQ & BQ --> SLOT{Concurrency\nslot available?}
    SLOT -->|yes| WORKER[Celery worker]
    SLOT -->|no| WAIT[Hold — wait for slot release]
    WAIT --> SLOT

    WORKER --> DONE2[Job complete]
    DONE2 --> RELEASE[release_extraction_slot_sync\ntask_postrun signal]
```

---

## 7. Degradation Modes

```mermaid
flowchart TD
    MW[quota_envelope middleware\nsets request.state.quota_mode]

    MW --> FULL[FULL\nNormal write path]
    MW --> PT[PASSTHROUGH\nJob created but no extraction queued\nadd returns status=passthrough]
    MW --> DR[DEGRADED_RETRIEVE\nWrites accepted\nRetrieval returns fewer results]
    MW --> BLK[BLOCKED\nadd returns status=passthrough\nL4 budget gate]

    style FULL fill:#86efac,color:#000
    style PT fill:#fde68a,color:#000
    style DR fill:#fed7aa,color:#000
    style BLK fill:#fca5a5,color:#000
```

---

## 8. Key Files Reference

| File | Role |
| --- | --- |
| `api/routers/memories.py` | HTTP entry point, idempotency, gate call, job dispatch |
| `api/services/quality_gate.py` | L1–L4 gate, rate limiting, semantic dedup, quality scoring |
| `api/services/budget_governor.py` | Tenant budget evaluation and token usage tracking |
| `api/services/extraction_service.py` | Two-pass LLM extraction, spec-driven prompts, candidate filtering |
| `api/tasks/extraction_tasks.py` | Celery task, full pipeline orchestration, retry + dead-letter |
| `api/services/conflict_resolver.py` | Memory dedup, conflict classification, resolution routing |
| `api/services/version_service.py` | Append-only version history |
| `api/services/embedding_service.py` | Vector embedding (Gemini / fallback) |
| `api/db/vector_store.py` | Qdrant read/write |
| `api/services/domain_schemas/edtech.py` | EdTech overlay extraction |
| `api/services/domain_schemas/support.py` | Support overlay extraction |
| `api/tasks/queue_router.py` | Tenant queue routing + concurrency slot management |
| `api/middleware/quota_envelope.py` | Quota mode headers → `request.state` |
| `api/db/models.py` | All ORM models |

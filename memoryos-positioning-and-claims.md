# MemoryOS Positioning and Claims

Status: Approved messaging source of truth  
Audience: Product, marketing, documentation, sales, demos, and launch reviewers  
Scope: Current MemoryOS release; revise when product capabilities materially change

## Canonical Position

**MemoryOS is the governed state and context layer for production AI agents.**

It turns relevant conversations, corrections, and application events into durable context that is
current, attributable, authorized, and ready for reuse by production AI agents.

MemoryOS is not valuable merely because it stores information. Its value is controlling how learned
state changes: what becomes durable, which revision is current, which source is trusted, who may use
it, when it is valid, and why it was returned.

## One-Sentence Explanation

Give every authorized agent the same current, trusted, and attributable user context.

## Category Explanation

Databases store records. Vector stores find similar records. MemoryOS governs what an agent is
allowed to believe and reuse now.

“Memory” remains useful product language, but public copy should explain it as **governed durable
state**, not unlimited recall or transcript storage.

## The Customer Problem

The strongest problem is not simply that an agent forgets. Production failures occur when:

- agents or services hold different facts about the same user or organization;
- a correction arrives but stale state continues to be retrieved;
- inferred context competes with direct or authoritative evidence;
- nobody can explain where a remembered claim came from;
- private context crosses tenant, user, agent, or consent boundaries;
- retries or concurrent writes create duplicate state or multiple winners;
- expiration, revocation, deletion, or delayed indexing changes what should be usable;
- teams must debug when and why an agent’s working context changed.

MemoryOS provides the control plane for these state transitions.

## Where MemoryOS Fits

MemoryOS complements the host application’s existing state infrastructure:

```text
Application database / CRM / transcripts / documents / tools
                         |
          relevant conversations, corrections, events
                         v
                     MemoryOS
       ingest -> extract -> reconcile -> govern -> retrieve
                         |
                         v
       compact, governed context for the next model call
```

This five-stage lifecycle is the canonical public description:

1. **Ingest** relevant conversations, corrections, and application events.
2. **Extract** candidate durable state and supporting evidence.
3. **Reconcile** candidates with existing claims, revisions, and conflicts.
4. **Govern** validity, provenance, authority, lifecycle, and access policy.
5. **Retrieve** current, authorized, prompt-ready context.

The capability pillars below describe what the product supports; they are not additional lifecycle
stages and should not be rewritten as a second pipeline.

The customer continues to own:

- complete conversation transcripts and message history;
- business records such as orders, invoices, tickets, and account balances;
- documents, knowledge bases, files, and static skills;
- application actions, tools, workflows, and final model responses;
- any raw event archive required by its own product or compliance model.

MemoryOS owns the governed durable context derived from approved inputs and the lifecycle of that
context.

## What MemoryOS Is Not

MemoryOS is not:

- a replacement for an application database, CRM, transcript store, or system of record;
- a replacement for a vector database in every application;
- a complete episodic archive of every conversation detail;
- a general document or world-knowledge RAG platform;
- an agent framework, foundation model, or action-execution system;
- a promise that an AI will remember everything forever;
- automatically necessary for every prototype or single-session chatbot.

An application can use MemoryOS independently through its API without migrating its existing data
stores. Integrations should send the events and conversations from which governed state may be
learned.

## Audience Terminology

Use **production AI agents** as the standard audience in headlines and positioning statements.
Use **host application** or **AI application** only when describing the software that integrates
MemoryOS, owns business data and actions, or invokes an agent. An agent-powered product may contain
one or many agents, but MemoryOS should not be positioned as necessary for every AI-enabled or
single-call application.

## Best-Fit Customers

Prioritize teams with one or more of these characteristics:

- multiple agents, services, or channels update context about the same user;
- users have long-lived relationships with the agent-powered product;
- facts, preferences, goals, procedures, or relationships change over time;
- conflicting sources have different authority;
- corrections must supersede stale state without erasing history;
- provenance, consent, auditability, or regulated-data boundaries matter;
- cross-agent context must be shared selectively;
- a wrong or stale memory has meaningful product or operational consequences.

## Lower-Priority Customers

MemoryOS may not be necessary yet when:

- the product is a short-lived or single-session prototype;
- the complete required context already fits reliably in one prompt;
- no durable user-specific state is learned;
- only static documents or general knowledge are retrieved;
- there are no meaningful corrections, conflicts, access boundaries, or audit requirements.

This qualification should be stated honestly. It strengthens the product’s relevance for customers
who do have the governance problem.

## Current Capability Pillars

This is a capability inventory, not the public lifecycle or a requirement that every homepage
section mention every item. Lead with the lifecycle and governance outcomes; use these capabilities
as supporting detail where relevant.

Public explanations may describe these supported capability areas, provided detailed claims remain
consistent with the current product and verified tests:

1. **Governed ingestion** — extract reusable state while filtering unsafe, transient, or
   insufficiently supported candidates.
2. **Claims and revisions** — preserve attributable state transitions instead of silently mutating
   a summary.
3. **Conflict and correction handling** — reconcile contradictions and supersession using source,
   evidence, recency, and configured authority.
4. **Temporal and lifecycle control** — distinguish current, historical, future, superseded,
   expired, archived, and revoked state where supported.
5. **Provenance** — retain source events, evidence, versions, and resolution history.
6. **Scoped coordination** — enforce tenant, user, agent, category, and consent boundaries.
7. **Reliable processing** — converge retries and duplicate event delivery on the intended logical
   state. Detailed terms such as idempotency and asynchronous processing belong in developer,
   reliability, and architecture material rather than primary marketing copy.
8. **Governed retrieval** — combine semantic relevance with authoritative lifecycle and access
   filtering before returning prompt-ready context.
9. **Domain overlays** — add typed product-specific state without replacing the general governed
   engine. Treat this as an optional product capability and use-case differentiator, not part of the
   universal core promise.

## Message Hierarchy

Public pages should communicate the product in this order:

1. **Operational outcome:** agents use current, trusted context.
2. **Failure being prevented:** stale corrections, conflicting facts, unauthorized sharing, and
   unexplained memories.
3. **Category:** governed state and context layer.
4. **How it works:** ingest signals, reconcile state, preserve provenance, retrieve approved
   context.
5. **Architecture boundary:** existing databases, transcripts, tools, and vector stores remain in
   place.
6. **Evidence:** demos, documented guarantees, benchmark methodology, and clearly stated
   limitations.

Do not lead only with the abstract phrase “AI memory.” Prospects who believe they already have
memory must see the state-governance problem before the product category is introduced.

## Approved Core Claims

Preferred claims:

- “The governed state and context layer for production AI agents.”
- “Give every authorized agent the same current, trusted, and attributable user context.”
- “Storage is the easy part. MemoryOS governs what changed, what is current, and who can use it.”
- “Keep your model, agent framework, databases, and tools.”
- “Turn relevant conversations, corrections, and events into governed, prompt-ready context.”
- “Preserve corrections, provenance, version history, and access boundaries.”
- “MemoryOS supplies context; your application still owns actions and final responses.”
- “Start with one API and add source authority, domain schemas, or cross-agent consent when needed.”

These statements describe product intent and architecture. Specific guarantees such as zero
leakage, exact latency, scale, accuracy, or reliability percentages require a named, reproducible
test result and must include its scope.

## Claims Requiring Qualification

Use only with an adjacent explanation:

| Phrase | Required qualification |
| --- | --- |
| “Persistent memory” | Explain that MemoryOS persists selected governed state, not every transcript detail. |
| “Shared memory” | State the relevant tenant, user, agent, category, and consent boundaries. |
| “Universal Memory” | Use only as the proper name of the specific consent-controlled cross-agent subsystem in technical material. Prefer “Memory Passport” or “consent-controlled cross-agent memory” in general public copy. Never use “universal” as a positioning-level scope claim. |
| “Production-ready” | Name the capability and supported deployment boundary; do not imply unrestricted scale. |
| “Source of truth” | Prefer “current trusted claim.” If “source of truth” is necessary, scope it explicitly: MemoryOS’s authoritative internal store governs learned context, while customer business systems remain authoritative for business records and actions. |
| “Automatic conflict resolution” | Acknowledge that ambiguous or policy-sensitive conflicts may require user clarification or tenant review. |
| “Works with any AI product” | Do not use as a value or suitability claim. A technical compatibility statement may instead say that MemoryOS integrates through an API and works alongside the customer’s chosen model or agent framework; separately identify which products benefit most. |

## Claims to Avoid

Do not publish these without new, directly supporting evidence:

- “Your AI will never forget.”
- “MemoryOS remembers everything.”
- “Complete” or “perfect” agent memory.
- “Works for every AI application.”
- “The universal solution for AI memory.”
- “Replaces your database, CRM, transcript store, or vector store.”
- “Best,” “most accurate,” or “industry-leading” memory platform.
- “Zero hallucinations” or any claim that MemoryOS guarantees model output correctness.
- “Unlimited scale,” “enterprise-ready at any scale,” or unsupported latency guarantees.
- Public benchmark superiority inferred from internal datasets or from benchmarks outside the
  current product scope.

## Terminology

Use consistently:

| Prefer | Avoid or qualify |
| --- | --- |
| governed state and context | memory storage alone |
| durable context | permanent memory |
| current trusted claim | source of truth or single source of truth in normal marketing and demo copy |
| superseded or historical revision | deleted old fact, when history is retained |
| source authority | the AI knows which source is correct |
| prompt-ready context | complete conversation recall |
| consent-controlled cross-agent memory | universal memory as a generic promise |
| customer system of record | MemoryOS as the system of record for business actions |

## Suggested Homepage Structure

1. **Hero:** current, trusted context across agents and services.
2. **Existing-storage clarification:** “Your agent probably has storage. It may not have governed
   state.”
3. **Comparison:** application DB, transcripts, vector search, skills/files, and MemoryOS.
4. **Failure scenarios:** stale corrections, conflicting sources, provenance, consent, and
   isolation.
5. **Lifecycle:** ingest, extract, reconcile, govern, retrieve.
6. **Who needs it / who may not:** qualify the target customer.
7. **Use cases:** support, education, and consent-controlled cross-agent context.
8. **Evidence and limits:** documented architecture, demos, benchmarks, operational scope, and
   explicit limitations.
9. **Integration:** keep existing infrastructure and add MemoryOS through the API.

## Review Checklist

Before publishing or updating public copy, verify:

- Does the copy distinguish governed state from transcript-complete episodic memory?
- Does it explain why a database or vector store alone does not solve the stated problem?
- Does it say what customer systems remain authoritative?
- Is the intended customer identifiable?
- Are consent, tenant, user, and agent boundaries described precisely?
- Are “universal,” “production-ready,” and “source of truth” qualified?
- Does every numerical or comparative claim cite current reproducible evidence?
- Are benchmark limitations stated alongside benchmark results?
- Do code samples use the current API domain, route, authentication, and SDK contract?
- Is simulated behavior visibly labeled as simulated?

## Governance of This Document

This document governs product positioning, not production behavior. It must not be used to change
the engine merely to satisfy marketing copy.

When product capability and public language disagree:

1. verify the current implementation and accepted regression evidence;
2. narrow the public claim if the capability is not proven;
3. update this document only after the product boundary or evidence changes;
4. keep internal benchmarks and public benchmark claims explicitly separate.

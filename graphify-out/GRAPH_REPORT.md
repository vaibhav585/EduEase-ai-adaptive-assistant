# Graph Report - .  (2026-06-27)

## Corpus Check
- Corpus is ~14,559 words - fits in a single context window. You may not need a graph.

## Summary
- 266 nodes · 252 edges · 65 communities (55 shown, 10 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.89)
- Token cost: 54,180 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend API Routes and Schemas|Backend API Routes and Schemas]]
- [[_COMMUNITY_Frontend Pages and App Shell|Frontend Pages and App Shell]]
- [[_COMMUNITY_Frontend NPM Dependencies|Frontend NPM Dependencies]]
- [[_COMMUNITY_Project Docs and Technical Audit|Project Docs and Technical Audit]]
- [[_COMMUNITY_Firebase Auth and User Flow|Firebase Auth and User Flow]]
- [[_COMMUNITY_Feature Overview and Architecture|Feature Overview and Architecture]]
- [[_COMMUNITY_Frontend Dev Dependencies|Frontend Dev Dependencies]]
- [[_COMMUNITY_Backend Package Metadata|Backend Package Metadata]]
- [[_COMMUNITY_FastAPI Endpoint Definitions|FastAPI Endpoint Definitions]]
- [[_COMMUNITY_Eye Tracking Calibration|Eye Tracking Calibration]]
- [[_COMMUNITY_Eye Tracking Component|Eye Tracking Component]]
- [[_COMMUNITY_Zustand App State Store|Zustand App State Store]]
- [[_COMMUNITY_Encouragement Messages|Encouragement Messages]]
- [[_COMMUNITY_PDF Library Integration|PDF Library Integration]]
- [[_COMMUNITY_i18next Internationalization|i18next Internationalization]]
- [[_COMMUNITY_Paced Reader Feature|Paced Reader Feature]]
- [[_COMMUNITY_Zustand State Concept|Zustand State Concept]]
- [[_COMMUNITY_Demo Script Document|Demo Script Document]]
- [[_COMMUNITY_Vite React Entry Point|Vite React Entry Point]]

## God Nodes (most connected - your core abstractions)
1. `AI Adaptive Assistant for Neurodivergent Learners` - 8 edges
2. `auth` - 6 edges
3. `scripts` - 5 edges
4. `RAG-based Chatbot Implementation` - 5 edges
5. `simplify()` - 4 edges
6. `translate()` - 4 edges
7. `translate_text()` - 4 edges
8. `Eye Tracking Focus Detection` - 4 edges
9. `Client-Server System Architecture` - 4 edges
10. `Technical Audit Executive Summary` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Teacher Dashboard Feature` --semantically_similar_to--> `Analytics Dashboard Feature`  [INFERRED] [semantically similar]
  project explanation.txt → README.md
- `Ethics and Privacy Document` --semantically_similar_to--> `COPPA Compliance Gap`  [INFERRED] [semantically similar]
  docs/ethics-privacy.md → project_technical_audit.html
- `Future Work Document` --semantically_similar_to--> `Advanced RAG Pipeline Roadmap`  [INFERRED] [semantically similar]
  docs/future-work.md → project_technical_audit.html
- `RAG-based Chatbot Implementation` --conceptually_related_to--> `AI Chatbot Feature`  [EXTRACTED]
  project explanation.txt → README.md
- `spaCy NLP Dependency` --implements--> `Text Simplification Feature`  [INFERRED]
  backend/requirements.txt → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Critical Security Vulnerabilities Requiring Remediation** — ai_assistant_neurodivergent_project_technical_audit_api_key_exposure, ai_assistant_neurodivergent_project_technical_audit_zero_auth, ai_assistant_neurodivergent_project_technical_audit_global_chat_memory_bug, ai_assistant_neurodivergent_project_technical_audit_coppa_compliance, ai_assistant_neurodivergent_project_technical_audit_client_side_role_gate, ai_assistant_neurodivergent_project_technical_audit_password_console_log [EXTRACTED 1.00]
- **AI-Powered Feature Pipeline** — ai_assistant_neurodivergent_readme_ai_chatbot, ai_assistant_neurodivergent_readme_text_simplification, ai_assistant_neurodivergent_readme_quiz_generation, ai_assistant_neurodivergent_project_explanation_rag_chatbot, ai_assistant_neurodivergent_project_explanation_gemini_model, backend_requirements_langchain [INFERRED 0.85]
- **Enterprise AI Roadmap Phases** — ai_assistant_neurodivergent_project_technical_audit_rag_roadmap, ai_assistant_neurodivergent_project_technical_audit_guardrails, ai_assistant_neurodivergent_project_technical_audit_multimodal_adaptive [EXTRACTED 1.00]

## Communities (65 total, 10 thin omitted)

### Community 0 - "Backend API Routes and Schemas"
Cohesion: 0.12
Nodes (20): BaseModel, ChatbotRequest, ChatbotResponse, LogEntry, RecommendRequest, SimplifiedText, TextToSimplify, TranslateRequest (+12 more)

### Community 1 - "Frontend Pages and App Shell"
Cohesion: 0.10
Nodes (11): AuthForm(), ContentItem, Layout(), RoleGate(), UploadForm(), ContentPage(), LoginPage(), Question (+3 more)

### Community 2 - "Frontend NPM Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, axios, firebase, i18next, lunr, @mediapipe/tasks-vision, react, react-dom (+16 more)

### Community 3 - "Project Docs and Technical Audit"
Cohesion: 0.11
Nodes (23): Firebase Authentication, Google Cloud Firestore Database, Google Gemini LLM Integration, RAG-based Chatbot Implementation, Client-Server System Architecture, Hardcoded API Key Security Vulnerability, Client-Side Only Role-Based Access Control, COPPA Compliance Gap (+15 more)

### Community 4 - "Firebase Auth and User Flow"
Cohesion: 0.15
Nodes (8): AuthFormProps, Message, analytics, app, auth, db, firebaseConfig, storage

### Community 5 - "Feature Overview and Architecture"
Cohesion: 0.15
Nodes (16): Teacher Dashboard Feature, Accessibility and UX for Neurodivergent Children, Event Loop Blocking Performance Issue, Multimodal and Adaptive Tech Roadmap, Analytics Dashboard Feature, Eye Tracking Focus Detection, Personalized Recommendations Feature, AI Adaptive Assistant for Neurodivergent Learners (+8 more)

### Community 6 - "Frontend Dev Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, postcss, tailwindcss, @types/lunr (+7 more)

### Community 7 - "Backend Package Metadata"
Cohesion: 0.20
Nodes (9): author, description, keywords, license, main, name, scripts, test (+1 more)

### Community 9 - "Eye Tracking Calibration"
Cohesion: 0.29
Nodes (3): CALIBRATION_POINTS, Props, Window

## Knowledge Gaps
- **75 isolated node(s):** `name`, `version`, `main`, `test`, `keywords` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Frontend Dev Dependencies` to `Frontend NPM Dependencies`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `main` to the rest of the system?**
  _79 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend API Routes and Schemas` be split into smaller, more focused modules?**
  _Cohesion score 0.11904761904761904 - nodes in this community are weakly interconnected._
- **Should `Frontend Pages and App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.10153846153846154 - nodes in this community are weakly interconnected._
- **Should `Frontend NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Project Docs and Technical Audit` be split into smaller, more focused modules?**
  _Cohesion score 0.1067193675889328 - nodes in this community are weakly interconnected._
- **Should `Firebase Auth and User Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.14619883040935672 - nodes in this community are weakly interconnected._
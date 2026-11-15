# Profile Intelligence application

An interactive companion to the notebook in the parent folder. It is in the planning stage: nothing here runs yet.

**Profile Discovery.** Write a fictional profile and see the most similar fictional profiles, each with an explanation, comparing TF-IDF with sentence embeddings.

**Data Science Lab.** The notebook's validated results, shown interactively: segments, model performance, fairness checks and an educational demonstration of the drinking classifier.

The application never shows a real profile. Discovery searches a pool of invented profiles, and the Lab shows aggregate results only.

## Stack

React, TypeScript and Tailwind CSS in the browser. FastAPI (Python) on the server, reusing the methods and package versions from the notebook.

## Layout

```
backend/    FastAPI service, offline build scripts and tests
content/    synthetic profiles and the Lab summary exported from the notebook
frontend/   Vite project (created in Phase 2)
planning/   architecture, design system, synthetic data rules, plan, design preview
```

## Documents

1. [Architecture](planning/01_architecture.md)
2. [Pages, journey and design system](planning/02_ux_and_design_system.md)
3. [Synthetic demonstration profiles](planning/03_synthetic_profiles.md)
4. [Dependencies, implementation plan and decisions](planning/04_implementation_plan.md)
5. [Design preview](planning/design_preview.html), a static page to open in a browser

## Status

Phase 1 (architecture and planning) is written and awaiting review. Running instructions will be added when there is something to run.

# Data Pipeline & Data Analysis Points in TechX Audio Description Feature

This document extracts the specific areas where data pipeline operations and data analysis occur within the proposed phases for the AI Audio Description feature.

## Data Pipeline Points (Data Movement & Storage)

*   **Phase 1.1: YouTube Video Ingestion:** The initial entry point of the pipeline. Involves fetching video metadata via APIs, downloading video streams or extracting raw frames, and writing this unstructured data to Cloud Storage (e.g., S3 or Google Cloud Storage) for downstream consumption.
*   **Phase 1.3: Frame Extraction and Routing:** Using tools like `ffmpeg` to programmatically extract specific video frames at calculated timestamps and routing these image assets through the system.
*   **Phase 3.2 & 3.3: Audio Mixing and Re-encoding (Static Option):** The pipeline step where the original video file, the generated TTS audio track, and volume ducking logic are compiled together to produce a new, enhanced video file, which is then saved back to Cloud Storage.
*   **Phase 4.1: Vector Database Ingestion:** Taking the final generated text descriptions and their corresponding timestamps, converting them into vector embeddings, and loading them into a Vector DB (like Pinecone or pgvector) to enable fast retrieval later.
*   **Phase 6: Overall Cloud Architecture Orchestration:** The end-to-end data flow orchestrated by Cloud Run jobs that trigger sequentially: Storage -> Speech-to-Text -> Vision API -> TTS -> Storage -> Vector DB.

## Data Analysis Points (Processing & Inference)

*   **Phase 1.2: Speech Activity Detection:** Analyzing the video's audio track using Speech-to-Text models (like Whisper) to generate word-level timestamp maps. This involves computational analysis to identify specific durations of silence (>0.8s) that qualify as "natural pauses."
*   **Phase 2.1: Vision Model Inference ("What's on Screen?"):** Sending extracted image frames to multimodal AI (like Gemini 1.5 Pro) to analyze visual data—such as code structure, chart trajectories, or terminal outputs—and synthesizing that visual data into natural language.
*   **Phase 2.2: Contextual Deduplication:** Analyzing the surrounding audio transcript context alongside the visual frame to make logical decisions about what *not* to say, ensuring the AI description doesn't redundantly repeat what the human instructor just spoke.
*   **Phase 4.3: RAG Retrieval and Generation:** When a user asks a question, the system analyzes the semantic intent of the query, performs a vector search against the stored descriptions, and analyzes the retrieved context to generate an accurate answer.

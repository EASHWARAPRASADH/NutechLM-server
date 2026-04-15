# NutechLM — Neural Research Vault

## Project Summary

NutechLM is a high-performance, local-first research platform designed for deep document analysis, synthesis, and reasoning. It provides a secure, private, and fully customizable research environment that operates entirely on your hardware with no external API dependency.

### Prerequisites

- **Node.js**: (v18 or higher)
- **Ollama**: Required for the local AI engine.
  - Download from [Ollama.com](https://ollama.com/)

### Hardware Requirements

**For your specific models (qwen2.5:14b + qwen2.5vl:7b):**

**Minimum (Basic functionality):**
- CPU: Intel i5/Ryzen 5 or Apple M1/M2
- RAM: 24GB (16GB for system + 8GB for models)
- GPU: 8GB VRAM minimum (RTX 3060, AMD RX 6600, or Apple M1/M2)
- Storage: 25GB SSD
- OS: macOS 12+, Windows 11, or Ubuntu 20.04+
- *Why*: qwen2.5:14b requires ~13GB VRAM at Q6_K quantization. qwen2.5vl:7b vision model needs ~8-12GB VRAM. 24GB system RAM ensures smooth operation when models are partially offloaded to CPU.

**Recommended (Good performance):**
- CPU: Intel i7/Ryzen 7 or Apple M2 Pro/M3
- RAM: 32GB
- GPU: 12GB VRAM (RTX 3060 12GB, RTX 4060, or Apple M2 Pro/M3)
- Storage: 50GB SSD
- *Why*: 12GB+ VRAM loads both models entirely on GPU for faster inference. 32GB RAM allows running both models simultaneously with document processing. SSD reduces model loading from ~30s to ~5s.

**Optimal (Best experience with vision/OCR):**
- CPU: Intel i9/Ryzen 9 or Apple M3 Pro/M3 Max
- RAM: 64GB
- GPU: 16GB+ VRAM (RTX 4070/4080/4090 or Apple M3 Pro/M3 Max)
- Storage: 100GB NVMe SSD
- *Why*: 16GB+ VRAM enables full GPU acceleration for both text and vision models with context windows. 64GB RAM handles multiple concurrent documents and large context windows. NVMe SSD provides instant model switching and document loading.

**Apple M4 Pro Specific Performance:**
- **M4 Pro with 36GB unified memory**: Handles qwen2.5:14b at ~15-20 tokens/sec. Good for single model usage. May struggle running both models simultaneously.
- **M4 Pro with 64GB unified memory**: Handles qwen2.5:14b at ~25-30 tokens/sec. Can run both text and vision models with context windows. Comparable to RTX 4060 performance.
- **M4 Pro with 128GB unified memory**: Handles qwen2.5:14b at ~35-40 tokens/sec. Excellent for vision/OCR workloads. Comparable to RTX 4070/4080 performance.
- *Note*: Apple Silicon uses unified memory (GPU + CPU share RAM pool), so 36GB unified ≈ 36GB VRAM equivalent. No separate VRAM limitation.

---

## 🚀 Getting Started (Mac / Linux)

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/EASHWARAPRASADH/Nutechlm.git
    cd Nutechlm
    ```
2.  **Pull Required AI Models**:
    Ensure Ollama is running, then pull the necessary models:
    ```bash
    ollama pull qwen2.5:14b
    ollama pull qwen2.5vl:7b
    ```
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Setup Environment**:
    Create a `.env` file from the example:
    ```bash
    cp .env.example .env
    ```
5.  **Run the Server**:
    ```bash
    npm run dev
    ```
    Access the app at [http://localhost:3000](http://localhost:3000).

---

## 🚀 Getting Started (Windows)

1.  **Clone the Repository**:
    ```powershell
    git clone https://github.com/EASHWARAPRASADH/Nutechlm.git
    cd Nutechlm
    ```
2.  **Pull Required AI Models**:
    Open your terminal (PowerShell or Command Prompt) and ensure Ollama is running:
    ```powershell
    ollama pull qwen2.5:14b
    ollama pull qwen2.5vl:7b
    ```
3.  **Install Dependencies**:
    ```powershell
    npm install
    ```
4.  **Setup Environment**:
    Manually copy `.env.example` to `.env` or use:
    ```powershell
    copy .env.example .env
    ```
5.  **Run the Server**:
    ```powershell
    npm run dev
    ```
    Access the app at [http://localhost:3000](http://localhost:3000).

---

## ✨ Features

- **Pure Local AI**: No API keys required, runs on your hardware via Ollama.
- **Vision Engine**: High-performance OCR and document analysis for tables, forms, and handwriting.
- **Deep Research**: Context-aware chat with source citations and structured reasoning.
- **Multi-format Support**: PDF, Word, Excel, and Image ingestion with automatic conversion.

## 🛠 Contributing

1. Fork the project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

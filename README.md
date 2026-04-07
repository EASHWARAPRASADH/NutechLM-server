# NutechLM — Neural Research Vault

## Project Summary

NutechLM is a high-performance, local-first research platform designed for deep document analysis, synthesis, and reasoning. It provides a secure, private, and fully customizable research environment that operates entirely on your hardware with no external API dependency.

### Prerequisites

- **Node.js**: (v18 or higher)
- **Ollama**: Required for the local AI engine.
  - Download from [Ollama.com](https://ollama.com/)
- **Recommended Hardware**: Desktop-grade Apple Silicon (M4 Pro/Max) or high-end NVIDIA GPU (12GB+ VRAM).

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

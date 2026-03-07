declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FIRECRAWL_API_KEY?: string;
      OUTPUT_DIR?: string;
    }
  }
}

export {};

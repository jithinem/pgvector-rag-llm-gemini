import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createEmbedding } from "../src/gemini.js";

const prisma = new PrismaClient();

const documents = [
  {
    id: "c2d7a01a-1e1d-4c0a-9b01-3cdbf7680a01",
    title: "What is pgvector?",
    content:
      "pgvector is a PostgreSQL extension that stores vector embeddings and supports similarity search. It lets applications combine relational data with vector search in one database.",
  },
  {
    id: "c2d7a01a-1e1d-4c0a-9b01-3cdbf7680a02",
    title: "Retrieval-augmented generation",
    content:
      "Retrieval-augmented generation (RAG) retrieves relevant information from a knowledge base and gives it to a language model as context. This helps the model answer questions using the stored information.",
  },
  {
    id: "c2d7a01a-1e1d-4c0a-9b01-3cdbf7680a03",
    title: "Gemini embeddings",
    content:
      "Gemini embedding models convert text into numerical vectors. In a document search system, store document vectors and compare them with a query vector to find semantically similar content.",
  },
  {
    id: "c2d7a01a-1e1d-4c0a-9b01-3cdbf7680a04",
    title: "Node.js and Express API",
    content:
      "Node.js runs JavaScript on the server, and Express provides a lightweight framework for HTTP APIs. An Express application can validate requests, call PostgreSQL through Prisma, and return JSON responses.",
  },
];

async function seed() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required to generate document embeddings");
  }

  const seededDocuments = [];
  for (const document of documents) {
    const embedding = await createEmbedding(
      `${document.title}\n\n${document.content}`,
      "RETRIEVAL_DOCUMENT",
    );
    seededDocuments.push({
      ...document,
      vector: `[${embedding.join(",")}]`,
    });
  }

  await prisma.$transaction(async (transaction) => {
    for (const document of seededDocuments) {
      await transaction.$executeRaw`
        INSERT INTO "documents" ("id", "title", "content", "embedding", "created_at", "updated_at")
        VALUES (${document.id}::uuid, ${document.title}, ${document.content}, ${document.vector}::vector, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "title" = EXCLUDED."title",
          "content" = EXCLUDED."content",
          "embedding" = EXCLUDED."embedding",
          "updated_at" = NOW()
      `;
    }
  });

  console.log(`Seeded ${seededDocuments.length} sample documents.`);
}

seed()
  .catch((error) => {
    console.error("Document seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

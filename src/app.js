import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import express from "express";
import { answerWithContext, createEmbedding } from "./gemini.js";

const prisma = new PrismaClient();
const app = express();

app.use(express.json({ limit: "1mb" }));

function asyncHandler(handler) {
  return (request, response, next) =>
    Promise.resolve(handler(request, response, next)).catch(next);
}

function validateDocument(body) {
  return (
    typeof body?.title === "string" &&
    body.title.trim().length > 0 &&
    typeof body?.content === "string" &&
    body.content.trim().length > 0
  );
}

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get(
  "/api/documents",
  asyncHandler(async (_request, response) => {
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
    response.json(documents);
  }),
);

app.get(
  "/api/documents/:id",
  asyncHandler(async (request, response) => {
    const document = await prisma.document.findUnique({
      where: { id: request.params.id },
    });

    if (!document) {
      return response.status(404).json({ error: "Document not found" });
    }

    response.json(document);
  }),
);

app.post(
  "/api/documents",
  asyncHandler(async (request, response) => {
    if (!validateDocument(request.body)) {
      return response
        .status(400)
        .json({ error: "Both title and content must be non-empty strings" });
    }

    const title = request.body.title.trim();
    const content = request.body.content.trim();
    const embedding = await createEmbedding(`${title}\n\n${content}`, "RETRIEVAL_DOCUMENT");
    const vector = `[${embedding.join(",")}]`;

    const [document] = await prisma.$queryRaw`
      INSERT INTO "documents" ("id", "title", "content", "embedding", "created_at", "updated_at")
      VALUES (${randomUUID()}::uuid, ${title}, ${content}, ${vector}::vector, NOW(), NOW())
      RETURNING "id", "title", "content", "created_at" AS "createdAt", "updated_at" AS "updatedAt"
    `;

    response.status(201).json(document);
  }),
);

app.put(
  "/api/documents/:id",
  asyncHandler(async (request, response) => {
    if (!validateDocument(request.body)) {
      return response
        .status(400)
        .json({ error: "Both title and content must be non-empty strings" });
    }

    const title = request.body.title.trim();
    const content = request.body.content.trim();
    const embedding = await createEmbedding(`${title}\n\n${content}`, "RETRIEVAL_DOCUMENT");
    const vector = `[${embedding.join(",")}]`;

    const document = await prisma.$transaction(async (transaction) => {
      await transaction.document.update({
        where: { id: request.params.id },
        data: { title, content },
      });

      await transaction.$executeRaw`
        UPDATE "documents"
        SET "embedding" = ${vector}::vector
        WHERE "id" = ${request.params.id}::uuid
      `;

      return transaction.document.findUnique({
        where: { id: request.params.id },
      });
    });

    response.json(document);
  }),
);

app.delete(
  "/api/documents/:id",
  asyncHandler(async (request, response) => {
    await prisma.document.delete({ where: { id: request.params.id } });
    response.status(204).end();
  }),
);

app.post(
  "/api/ask",
  asyncHandler(async (request, response) => {
    const question = request.body?.question;
    if (typeof question !== "string" || question.trim().length === 0) {
      return response.status(400).json({ error: "A non-empty question is required" });
    }

    const embedding = await createEmbedding(question.trim(), "RETRIEVAL_QUERY");
    const vector = `[${embedding.join(",")}]`;
    const documents = await prisma.$queryRaw`
      SELECT
        "id",
        "title",
        "content",
        1 - ("embedding" <=> ${vector}::vector) AS "similarity"
      FROM "documents"
      ORDER BY "embedding" <=> ${vector}::vector
      LIMIT 3
    `;

    if (documents.length === 0) {
      return response.json({
        answer: "I couldn't find any documents to answer from.",
        sources: [],
      });
    }

    const answer = await answerWithContext(question.trim(), documents);
    response.json({
      answer,
      sources: documents.map(({ id, title, similarity }) => ({
        id,
        title,
        similarity: Number(similarity),
      })),
    });
  }),
);

app.use((error, _request, response, _next) => {
  console.error(error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return response.status(404).json({ error: "Document not found" });
    }
    if (error.code === "P2023") {
      return response.status(400).json({ error: "Invalid document ID" });
    }
  }

  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Invalid JSON body" });
  }

  response.status(500).json({ error: "Internal server error" });
});

export { app, prisma };

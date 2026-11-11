# pgvector + RAG + Gemini demo

A small REST API for storing documents, generating Gemini embeddings, and answering questions from the most similar documents in PostgreSQL.

## Requirements

- Node.js 20+
- PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension installed
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

1. Create a PostgreSQL database named `pgvector_rag`. Ensure the pgvector extension is installed on the PostgreSQL server; the migration enables it in the database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `GEMINI_API_KEY`. Optionally change `GEMINI_EMBEDDING_MODEL` or `GEMINI_GENERATION_MODEL` to select different Gemini models; the values shown in `.env.example` are the defaults.
3. Install dependencies and apply the migration:

   ```sh
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. Start the API:

   ```sh
   npm run dev
   ```

The API listens on `http://localhost:3000` by default.

`npm run db:seed` adds four sample documents with Gemini embeddings. It is safe to rerun: it updates the same seed documents instead of creating duplicates.

Import [`postman.json`](./postman.json) into Postman to try all API endpoints. The collection uses `http://localhost:3000` as its base URL and saves a created document's ID for the get, update, and delete requests.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/api/documents` | Create a document and its embedding |
| `GET` | `/api/documents` | List documents |
| `GET` | `/api/documents/:id` | Get one document |
| `PUT` | `/api/documents/:id` | Update a document and regenerate its embedding |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `POST` | `/api/ask` | Retrieve similar documents and answer a question |

Create or update a document with JSON:

```json
{
  "title": "About pgvector",
  "content": "pgvector adds vector similarity search to PostgreSQL."
}
```

Ask a question with JSON:

```json
{
  "question": "How does pgvector help?"
}
```

`/api/ask` embeds the question with Gemini, finds the three nearest document vectors using cosine distance, and gives those excerpts to Gemini for an answer. Its response includes the answer and the source documents.

The Gemini embedding model uses 1,536 dimensions to match the PostgreSQL vector column. If you have existing documents embedded with a different provider, recreate those documents so their embeddings use Gemini before relying on search results.

## Try it

```sh
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"About pgvector\",\"content\":\"pgvector adds vector similarity search to PostgreSQL.\"}"

curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What does pgvector add to PostgreSQL?\"}"
```

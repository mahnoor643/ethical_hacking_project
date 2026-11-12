
import { runAgent } from "./agent";

interface Env {
  DB: D1Database;
  AI: Ai;
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "success",
        message: "Agent Activity Logger API is running!"
      });
    }

    // Run AI Agent
    if (
      url.pathname === "/api/agent/run" &&
      request.method === "POST"
    ) {
      try {
        const body: unknown = await request.json();

        if (
          !body ||
          typeof body !== "object" ||
          !("task" in body) ||
          typeof body.task !== "string" ||
          !body.task.trim() ||
          body.task.length > 500
        ) {
          return Response.json(
            { error: "Task must be 1-500 characters" },
            { status: 400 }
          );
        }

        const task = body.task.trim();

        // Restrict tasks to sales analysis.
        if (!/sales|sale|revenue/i.test(task)) {
          return Response.json(
            { error: "Only sales analysis tasks are supported" },
            { status: 400 }
          );
        }

        // Pass both D1 and Workers AI bindings.
        const result = await runAgent(env, task);

        return Response.json(result);

      } catch (error) {
        console.error("API error:", error);

        return Response.json(
          { error: "Agent execution failed" },
          { status: 500 }
        );
      }
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};

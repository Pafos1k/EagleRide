import express from "express";
import path from "path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535");
  }

  app.use(express.json({ limit: "1mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // AI Smart Ride Recommendations
  app.post("/api/recommendations", async (req, res) => {
    try {
      const { userProfile, availableRides } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({ recommendations: [] });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `User Profile: ${userProfile || ""}\nAvailable Rides JSON: ${availableRides || ""}\nBased on the user's history and current available rides at Boston College, suggest the top 2 best matches and why. Output as JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    rideId: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ["rideId", "reason"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"recommendations": []}');
      res.json(parsed);
    } catch (error) {
      console.error("Server Gemini recommendations error:", error);
      res.json({ recommendations: [] });
    }
  });

  // AI Pickup & Destination Location Guidance
  app.post("/api/location-guidance", async (req, res) => {
    const { pickupZone = "Campus", destinationAddress = "Destination" } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          text: `Drivers meeting at ${pickupZone} typically pull up alongside the main passenger loading zone or designated campus circle. Coordinate in your group chat upon driver arrival!`,
          links: [],
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `You are an expert on the Boston College (Chestnut Hill / Newton) campus layout.
User is taking an Uber/Lyft rideshare from BC.
Pickup Zone: ${pickupZone} (on-campus).
Destination: ${destinationAddress}.

Task:
1. Tell the student in 1-2 concise sentences the EXACT spot where Uber/Lyft drivers wait or pull up for the ${pickupZone} zone (e.g., Conte Forum circle, Beacon St bus shelter, Main Gate, Stuart Hall turnaround).
2. Ground with links for the pickup landmark and the destination address.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || `Drivers meeting at ${pickupZone} typically wait at the primary designated pull-off or visitor entrance.`;
      const links =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks
          ?.filter((chunk: any) => chunk.web || chunk.maps)
          ?.map((chunk: any) => ({
            title: chunk.maps?.title || chunk.web?.title || "View on Google Maps",
            uri: chunk.maps?.uri || chunk.web?.uri || "",
          })) || [];

      res.json({ text, links });
    } catch (error) {
      console.error("Server Gemini location guidance error:", error);
      res.json({
        text: `Coordinate with your group in chat for the exact pickup spot. Rides at ${pickupZone} meet at the nearest marked loading loop.`,
        links: [],
      });
    }
  });

  // Vite middleware for development vs static production serving
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fileURLToPath(new URL("../client/", import.meta.url));
    app.use(express.static(distPath));
    app.use((req, res) => {
      // HashRouter only needs the document at /. Missing assets and APIs are 404s.
      if ((req.method === "GET" || req.method === "HEAD") && req.path === "/") {
        return res.sendFile(path.join(distPath, "index.html"));
      }
      res.status(404).json({ error: "Not found" });
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : PORT;
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

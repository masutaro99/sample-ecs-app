import express, { Request, Response } from "express";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const app = express();

app.use(express.json());

app.get("/", (request: Request, response: Response) => {
  response.status(200).send("Hello World");
});

// SQL Injection vulnerability
app.get("/user/:id", (req: Request, res: Response) => {
  const userId = req.params.id;
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  console.log("Executing query:", query);
  res.json({ query });
});

// Command Injection vulnerability
app.post("/execute", (req: Request, res: Response) => {
  const command = req.body.command;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ output: stdout, error: stderr });
  });
});

// Path Traversal vulnerability
app.get("/file", (req: Request, res: Response) => {
  const filename = req.query.filename as string;
  const filePath = path.join(__dirname, "uploads", filename);
  
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.json({ content: data });
  });
});

// Information disclosure
app.get("/debug", (req: Request, res: Response) => {
  res.json({
    env: process.env,
    version: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app
  .listen(80, () => {
    console.log("Server running at PORT: ", 80);
  })
  .on("error", (error) => {
    throw new Error(error.message);
  });

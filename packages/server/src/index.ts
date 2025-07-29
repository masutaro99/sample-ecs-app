import express, { Request, Response } from "express";
import * as pg from "pg";

const app = express();

const connection = new pg.Pool({
  user: process.env.DATABASE_USER,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  port: 5432,
});

app.get("/", (request: Request, response: Response) => {
  response.status(200).send("Hello World");
});

app.get("/users", async (req: Request, res: Response) => {
  try {
    const users = await getUsers();
    res.status(200).json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    console.error("error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user information",
    });
  }
});

app
  .listen(80, () => {
    console.log("Server running at PORT: ", 80);
  })
  .on("error", (error) => {
    throw new Error(error.message);
  });

function getUsers(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    connection.query("SELECT * FROM users", (err, result) => {
      if (err) {
        console.error("database error:", err);
        reject(err);
        return;
      }
      console.log("users:", result.rows);
      resolve(result.rows);
    });
  });
}

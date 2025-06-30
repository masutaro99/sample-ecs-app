import express, { Request, Response } from "express";
import * as pg from "pg";

const app = express();

const connection = new pg.Pool({
  user: "postgres",
  host: process.env.DATABASE_HOST,
  database: "postgres",
  password: "postgres",
  port: 5432,
});

app.get("/", (request: Request, response: Response) => {
  response.status(200).send("Hello World");
});

app
  .listen(80, () => {
    console.log("Server running at PORT: ", 80);
  })
  .on("error", (error) => {
    throw new Error(error.message);
  });

function sqlInjectionNoncompliant() {
  app.get("/user/:id", (req: Request, res: Response) => {
    var query = "SELECT * FROM Employees WHERE ID = " + req.params.id;

    connection.query(query, (error: any, results: any, fields: any) => {
      if (error) throw error;
    });
  });
}

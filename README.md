# 🧩 SQLite Explorer (Partial SQLite Engine in Node.js)

This project is a minimal SQLite query engine written in **Node.js**, capable of parsing `.db` files and executing basic `SELECT` queries.

It directly reads and parses SQLite database files **without using any external SQLite library** — everything from reading the binary format to parsing varints and interpreting serial types is implemented manually.

---

## ✨ Features

- 📂 Reads raw `.sqlite` or `.db` files
- 🧠 Supports:
  - `SELECT column FROM table`
  - `SELECT column1, column2 FROM table`
  - `WHERE` clause filtering (`=` only)
- 🔍 Parses the `sqlite_schema` to identify table structure
- 🧮 Decodes serial types, varints, and interprets row data

---

## 🧪 Examples

### One Column

```bash
$ node app/main.js sample.db "SELECT name FROM apples"
Granny Smith
Fuji
Honeycrisp
Golden Delicious
```
### Multiple Columns

```bash
$ node app/main.js sample.db "SELECT name, color FROM apples"
Granny Smith|Light Green
Fuji|Red
Honeycrisp|Blush Red
Golden Delicious|Yellow
```
### With Where Clause

```bash
$ node app/main.js sample.db "SELECT name, color FROM apples WHERE color = 'Yellow'"
Golden Delicious|Yellow
```

---

## 📁 Project Structure

```
app/
  └── main.js       # Entry point for handling SELECT queries
sample.db           # SQLite database to test on
package.json

```

---

##  📚 What You'll Learn

- How SQLite encodes its data

- B-tree structure in SQLite (partially)

- Reading binary files using Node.js fs module

- Handling varints and serial types

- How SQL statements are parsed and mapped to raw binary records

---

## 🔮 Future Improvements

📜 Full table scan with B-tree traversal 

🚀 Retrieving data using index

🔢 Support for numeric column types (INTEGER, REAL, etc.)

---

## 🙏 Acknowledgements

Inspired by the CodeCrafters SQLite challenge.

---

## 📄 License
Feel free to fork, modify, or build on top of this minimal SQLite engine! 🚀

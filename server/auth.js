const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const USERS = {
  admin: bcrypt.hashSync("password123", 10),
};

function login(username, password) {
  if (!USERS[username]) return null;

  const match = bcrypt.compareSync(password, USERS[username]);
  if (!match) return null;

  return jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: "8h" });
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).send("No token");

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).send("Invalid token");
  }
}

module.exports = { login, verifyToken };
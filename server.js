// Load env variables early
require("dotenv-expand").expand(require("dotenv").config())
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const path = require("path")
const twilio = require("twilio")

const app = express()

// Middlewares
app.use(cors())
app.use(helmet())
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Validate required Twilio env variables
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_PHONE_NUMBER,
  TWILIO_AUTH_TOKEN,
  PORT = 3000,
  VERCEL_URL,
} = process.env

const requiredVars = {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_PHONE_NUMBER,
  TWILIO_AUTH_TOKEN,
}

const missing = Object.entries(requiredVars)
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length) {
  console.error("❌ Missing environment variables:", missing.join(", "))
  missing.forEach((k) => console.log(`  ${k}=your_${k.toLowerCase()}`))
  process.exit(1)
}

console.log("✅ All required environment variables are set.")
console.log(`📱 Twilio phone number: ${TWILIO_PHONE_NUMBER}`)

// Twilio Client
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

// Voice webhook endpoint
app.post("/voice", (req, res) => {
  console.log("📥 /voice webhook hit:", req.body)
  const to = req.body.To || req.query.To
  const twiml = new twilio.twiml.VoiceResponse()

  if (to) {
    twiml.dial({ callerId: TWILIO_PHONE_NUMBER }).number(to)
  } else {
    twiml.say("No phone number provided.")
  }

  res.type("text/xml").send(twiml.toString())
})

// Token generator for Twilio Client (e.g. in-browser calls)
app.get("/token", (req, res) => {
  const AccessToken = twilio.jwt.AccessToken
  const VoiceGrant = AccessToken.VoiceGrant

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY,
    TWILIO_API_SECRET,
    { identity: "loan-agent" }
  )

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: false,
    })
  )

  res.json({ token: token.toJwt(), identity: "loan-agent" })
})

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() })
})

// Static file serving
app.use(express.static(path.join(__dirname, "public")))
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
  if (VERCEL_URL) {
    console.log(`🔗 Production: https://${VERCEL_URL}`)
  }
})

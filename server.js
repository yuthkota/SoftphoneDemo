// Add dotenv for local development
require("dotenv").config()

const express = require("express")
const cors = require("cors")
const twilio = require("twilio")
const path = require("path")
const app = express()

app.use(cors())
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Use environment variables for Twilio credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_API_KEY = process.env.TWILIO_API_KEY
const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN

// Validate environment variables (same as before)
const requiredEnvVars = {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_PHONE_NUMBER,
  TWILIO_AUTH_TOKEN,
}

const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key)

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingVars.join(", "))
  console.log("Please set these environment variables:")
  missingVars.forEach((varName) => {
    console.log(`  ${varName}=your_${varName.toLowerCase()}`)
  })
  process.exit(1)
}

console.log("✅ All Twilio environment variables are configured")
console.log(`📱 Using phone number: ${TWILIO_PHONE_NUMBER}`)

// Initialize Twilio client
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

// *** NEW: Voice webhook endpoint for Twilio Client calls ***
app.post("/voice", (req, res) => {
    console.log("📥 /voice webhook received:", req.body)
  
    const to = req.body.To || req.query.To
    const twiml = new twilio.twiml.VoiceResponse()
  
    if (to) {
      const dial = twiml.dial({ callerId: TWILIO_PHONE_NUMBER })
      dial.number(to)
    } else {
      twiml.say("No phone number provided.")
    }
  
    res.type("text/xml")
    res.send(twiml.toString())
  })
  

// SIMPLIFIED: Direct call without webhooks
app.post("/make-call", async (req, res) => {
  // ... your existing /make-call code ...
})

// ALTERNATIVE: Conference-based calling (more advanced)
app.post("/make-conference-call", async (req, res) => {
  // ... your existing /make-conference-call code ...
})

// Health check endpoint
app.get("/health", (req, res) => {
  // ... your existing /health code ...
})

// Token endpoint for Twilio Client (browser calls)
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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")))

// Root endpoint serves the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`🌐 Portal URL: http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/health`)
  console.log(`📞 Direct calling enabled (no webhooks required)`)

  if (process.env.VERCEL_URL) {
    console.log(`🔗 Production URL: https://${process.env.VERCEL_URL}`)
  }
})

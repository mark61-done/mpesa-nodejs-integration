require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http");
const bodyParser = require("body-parser");
const moment = require("moment");
const axios = require("axios");

// env variables
const port = process.env.PORT || 2000;
const hostname = process.env.HOSTNAME || "localhost";
const callbackUrl = process.env.CALLBACK_URL;

app.use(bodyParser.json());
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("MPESA integration with Node");
  const timeStamp = moment().format("YYYYMMDDHHmmss");
  console.log(timeStamp);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}`);
});

// Access token function
async function getAccessToken() {
  const consumer_key = process.env.CONSUMER_KEY;
  const consumer_secret = process.env.CONSUMER_SECRET;
  const url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const auth =
    "Basic " +
    Buffer.from(`${consumer_key}:${consumer_secret}`).toString("base64");

  try {
    const response = await axios.get(url, { headers: { Authorization: auth } });
    const accessToken = response.data.access_token;
    if (!accessToken) throw new Error("No access token in OAuth response");
    console.log("Generated Access Token:", accessToken);
    return accessToken;
  } catch (error) {
    console.error(
      "Error fetching access token:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Mpesa STK Push
app.get("/stkpush", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      const url =
        "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
      const auth = `Bearer ${accessToken}`;
      const timestamp = moment().format("YYYYMMDDHHmmss");
      const password = Buffer.from(
        process.env.BUSINESS_SHORT_CODE + process.env.PASSKEY + timestamp
      ).toString("base64");

      axios
        .post(
          url,
          {
            BusinessShortCode: process.env.BUSINESS_SHORT_CODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: "1",
            PartyA: process.env.PHONE_NUMBER,
            PartyB: process.env.BUSINESS_SHORT_CODE,
            PhoneNumber: "254721869757",
            CallBackURL: `${callbackUrl}/callback`,
            AccountReference: "Kelvin Carter",
            TransactionDesc: "Mpesa Daraja API STK Push Demo",
          },
          {
            headers: {
              Authorization: auth,
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          console.log("STK Push Response:", response.data);
          res.send(
            "😀 Request is successful done ✔✔. Please enter M-Pesa PIN to complete the transaction"
          );
        })
        .catch((error) => {
          console.error(
            "STK Push Error:",
            error.response?.data || error.message
          );
          res.status(500).send("STK Push request failed");
        });
    })
    .catch((error) => {
      console.error("Access Token Error:", error);
      res.status(500).send("Failed to get access token");
    });
});

// STK Push Callback Handler
app.post("/callback", (req, res) => {
  const callbackData = req.body.Body?.stkCallback;
  if (!callbackData) {
    console.log("Invalid callback data received:", req.body);
    return res.status(400).send("Invalid callback data");
  }

  const { ResultCode, ResultDesc, CheckoutRequestID } = callbackData;

  switch (ResultCode) {
    case "0":
      console.log(
        `✅ Transaction successful for CheckoutRequestID: ${CheckoutRequestID}`
      );
      console.log("Details:", callbackData);
      break;
    case "1032":
      console.log(
        `❌ Transaction declined by customer for CheckoutRequestID: ${CheckoutRequestID}`
      );
      console.log("Reason:", ResultDesc);
      break;
    case "1037":
      console.log(
        `⏳ Transaction timed out for CheckoutRequestID: ${CheckoutRequestID}`
      );
      console.log("Reason:", ResultDesc);
      break;
    default:
      console.log(
        `⚠️ Transaction failed for CheckoutRequestID: ${CheckoutRequestID}`
      );
      console.log("ResultCode:", ResultCode, "Reason:", ResultDesc);
      break;
  }

  // Acknowledge the callback to M-Pesa
  res.status(200).send("Callback received");
});

// Register URL for C2B (unchanged for now)
app.get("/registerurl", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      const url = "https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl";
      const auth = `Bearer ${accessToken}`;
      axios
        .post(
          url,
          {
            ShortCode: "174379",
            ResponseType: "Completed",
            ConfirmationURL: `${callbackUrl}/confirmation`,
            ValidationURL: `${callbackUrl}/validation`,
          },
          {
            headers: {
              Authorization: auth,
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => res.status(200).json(response.data))
        .catch((error) => {
          console.error(
            "C2B Register Error:",
            error.response?.data || error.message
          );
          res.status(500).send("❌ C2B URL registration failed");
        });
    })
    .catch((error) => {
      console.error("Access Token Error (C2B):", error);
      res.status(500).send("❌ Failed to get access token for C2B");
    });
});

app.post("/confirmation", (req, res) => {
  console.log("Confirmation Callback:", req.body);
  res.status(200).json({ ResultCode: "0", ResultDesc: "Success" });
});

app.post("/validation", (req, res) => {
  console.log("Validation Callback:", req.body);
  res.status(200).json({ ResultCode: "0", ResultDesc: "Success" });
});

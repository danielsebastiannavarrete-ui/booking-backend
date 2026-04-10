import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const SHOP = process.env.SHOP;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

async function getAccessToken() {
  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("client_id", CLIENT_ID);
  body.append("client_secret", CLIENT_SECRET);

  const response = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: body.toString()
  });

  const rawText = await response.text();
  console.log("Token raw response:", rawText);

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Token endpoint did not return JSON: ${rawText.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`Token error: ${JSON.stringify(data)}`);
  }

  if (!data.access_token) {
    throw new Error(`No access token returned: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

app.get("/", (req, res) => {
  res.send("Booking backend is running.");
});

app.post("/create-booking", async (req, res) => {
  try {
    const {
      vehicle,
      price,
      pickup,
      dropoff,
      date,
      tripType,
      name,
      email,
      phone
    } = req.body;

    const accessToken = await getAccessToken();

    const response = await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({
        query: `
          mutation draftOrderCreate($input: DraftOrderInput!) {
            draftOrderCreate(input: $input) {
              draftOrder {
                id
                invoiceUrl
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          input: {
            email: email,
            lineItems: [
              {
                title: `${vehicle} Booking`,
                quantity: 1,
                originalUnitPrice: Number(price)
              }
            ],
            note: `Vehicle: ${vehicle}
Pickup: ${pickup}
Dropoff: ${dropoff}
Date: ${date}
Trip: ${tripType}
Customer: ${name}
Phone: ${phone}`
          }
        }
      })
    });

    const rawText = await response.text();
    console.log("Shopify GraphQL raw response:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`GraphQL did not return JSON: ${rawText.slice(0, 300)}`);
    }

    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    if (data.errors) {
      return res.status(500).json({ error: data.errors });
    }

    const draft = data.data?.draftOrderCreate;

    if (draft?.userErrors?.length) {
      return res.status(400).json({ error: draft.userErrors });
    }

    const checkoutUrl = draft?.draftOrder?.invoiceUrl;

    if (!checkoutUrl) {
      return res.status(500).json({ error: "No checkout URL returned", raw: data });
    }

    res.json({ checkoutUrl });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});
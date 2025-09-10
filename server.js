require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const app = express();

// ======================
// 🔹 CORS Setup
// ======================
const allowedOrigins = [
  "http://localhost:3000",
  "https://shudh-anvi-main.onrender.com",
  "https://shudh.anvirobotics.com",
  "https://shudh-anvi-main-l6pz.onrender.com"//new render
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // enable cookies/auth headers if needed
};

app.use(cors(corsOptions));

// ======================
// 🔹 Environment Variables
// ======================
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const containerName = process.env.AZURE_CONTAINER_NAME;
const PORT = process.env.PORT || 5000;

// ======================
// 🔹 Azure Setup
// ======================
const sharedKeyCredential = new StorageSharedKeyCredential(
  accountName,
  accountKey
);

const blobServiceClient = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net`,
  sharedKeyCredential
);

// ======================
// 🔹 SAS Generator
// ======================
function generateSAS(container, blobName) {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setHours(now.getHours() + 48); // 48 hours expiry

  const sasParams = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: now,
      expiresOn: expiry,
    },
    sharedKeyCredential
  );

  return `https://${accountName}.blob.core.windows.net/${container}/${blobName}?${sasParams.toString()}`;
}

// ======================
// 🔹 API Endpoints
// ======================

// 1. List all devices
app.get("/api/devices", async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const devices = new Set();

    for await (const blob of containerClient.listBlobsFlat()) {
      const [deviceId] = blob.name.split("/");
      if (deviceId) devices.add(deviceId);
    }

    res.json([...devices]);
  } catch (err) {
    console.error("Error fetching devices:", err.message);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// 2. List all operations for a given device
app.get("/api/devices/:deviceId/operations", async (req, res) => {
  try {
    const { deviceId } = req.params;
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const operations = new Set();

    for await (const blob of containerClient.listBlobsFlat({ prefix: `${deviceId}/` })) {
      const parts = blob.name.split("/");
      if (parts.length > 1 && parts[1]) {
        operations.add(parts[1]); 
      }
    }

    res.json([...operations]);
  } catch (err) {
    console.error("Error fetching operations:", err.message);
    res.status(500).json({ error: "Failed to fetch operations" });
  }
});

// 3. Get before/after images
app.get("/api/devices/:deviceId/:operationId/images", async (req, res) => {
  try {
    const { deviceId, operationId } = req.params;
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const prefix = `${deviceId}/${operationId}/`; 
    const result = { before: null, after: null };

    console.log("Checking prefix:", prefix);

    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const url = generateSAS(containerName, blob.name);
      const lname = blob.name.toLowerCase();
      if (lname.includes("before")) result.before = url;
      if (lname.includes("after")) result.after = url;
    }

    res.json(result);
  } catch (err) {
    console.error("Error fetching images:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ======================
// 🔹 Start Server
// ======================
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});

require('dotenv').config({ override: true });
const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  console.log("URI from process.env.MONGODB_URI:", uri);
  
  if (!uri) {
    console.error("No MONGODB_URI found in env");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("SUCCESS: Connected to MongoDB Atlas!");
    process.exit(0);
  } catch (error) {
    console.error("ERROR: Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

testConnection();

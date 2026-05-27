const express = require('express');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET all rooms (Public) with optional search & filter
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const roomsCollection = db.collection('rooms');
    
    const { search, amenities, limit, sort } = req.query;
    let query = {};

    // Challenge 7.2: Search by room name
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Challenge 7.2: Filter by amenities (expects comma-separated string)
    if (amenities) {
      const amenitiesArray = amenities.split(',');
      // Room must have ALL selected amenities (or you can use $in for ANY)
      query.amenities = { $all: amenitiesArray };
    }

    let cursor = roomsCollection.find(query);

    // Sorting and limiting (e.g. for Home page latest rooms)
    if (sort === 'latest') {
      cursor = cursor.sort({ _id: -1 });
    }
    
    if (limit) {
      cursor = cursor.limit(parseInt(limit));
    }

    const rooms = await cursor.toArray();
    res.status(200).json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET my listings (Private)
router.get('/my-listings', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const roomsCollection = db.collection('rooms');
    
    const rooms = await roomsCollection.find({ ownerId: req.user.id }).toArray();
    res.status(200).json(rooms);
  } catch (error) {
    console.error('Error fetching my listings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET single room details (Public)
router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const roomsCollection = db.collection('rooms');
    
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const room = await roomsCollection.findOne({ _id: new ObjectId(req.params.id) });
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    res.status(200).json(room);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST add a room (Private)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, image, floor, capacity, hourlyRate, amenities } = req.body;
    
    // Validation
    if (!name || !description || !image || !capacity || !hourlyRate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = getDB();
    const roomsCollection = db.collection('rooms');

    const newRoom = {
      name,
      description,
      image,
      floor,
      capacity: parseInt(capacity),
      hourlyRate: parseInt(hourlyRate),
      amenities: Array.isArray(amenities) ? amenities : [],
      ownerId: req.user.id,
      bookingCount: 0,
      createdAt: new Date()
    };

    const result = await roomsCollection.insertOne(newRoom);
    res.status(201).json({ message: 'Room added successfully', roomId: result.insertedId });
  } catch (error) {
    console.error('Error adding room:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT update a room (Private, Owner only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const roomsCollection = db.collection('rooms');
    
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const roomId = new ObjectId(req.params.id);
    const room = await roomsCollection.findOne({ _id: roomId });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized: You can only edit your own rooms' });
    }

    // Extract update fields
    const { name, description, image, floor, capacity, hourlyRate, amenities } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
    if (floor !== undefined) updateData.floor = floor;
    if (capacity !== undefined) updateData.capacity = parseInt(capacity);
    if (hourlyRate !== undefined) updateData.hourlyRate = parseInt(hourlyRate);
    if (amenities !== undefined) updateData.amenities = Array.isArray(amenities) ? amenities : [];
    updateData.updatedAt = new Date();

    await roomsCollection.updateOne(
      { _id: roomId },
      { $set: updateData }
    );

    res.status(200).json({ message: 'Room updated successfully' });
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE room (Private, Owner only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const roomsCollection = db.collection('rooms');
    const bookingsCollection = db.collection('bookings');
    
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const roomId = new ObjectId(req.params.id);
    const room = await roomsCollection.findOne({ _id: roomId });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized: You can only delete your own rooms' });
    }

    // Delete the room
    await roomsCollection.deleteOne({ _id: roomId });

    // Optional challenge logic: Cancel related bookings
    // Using $pull logic on the user bookings array is required in challenge 7.3, but first let's just mark bookings as cancelled
    await bookingsCollection.updateMany(
      { roomId: roomId.toString() },
      { $set: { status: 'cancelled' } }
    );

    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

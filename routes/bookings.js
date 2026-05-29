const express = require('express');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET my bookings (Private)
router.get('/my-bookings', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    
    const bookings = await bookingsCollection.find({ userId: req.user.id }).toArray();
    res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching my bookings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST book a room (Private)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { roomId, date, startTime, endTime, totalCost, roomName, roomImage } = req.body;
    
    if (!roomId || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    const roomsCollection = db.collection('rooms');

    // CONFLICT CHECK (Challenge 7.3 & Core requirement)
    // Find any booking for this room on this date that is NOT cancelled
    // and where time overlaps. Overlap condition:
    
    const conflictQuery = {
      roomId: roomId,
      date: date,
      status: { $ne: 'cancelled' },
      $and: [
        { startTime: { $lt: endTime } },
        { endTime: { $gt: startTime } }
      ]
    };

    const conflict = await bookingsCollection.findOne(conflictQuery);

    if (conflict) {
      return res.status(400).json({ message: 'Room is already booked for the selected time slot' });
    }

    const newBooking = {
      roomId,
      userId: req.user.id,
      roomName, 
      roomImage,
      date,
      startTime,
      endTime,
      totalCost: parseFloat(totalCost),
      status: 'confirmed',
      createdAt: new Date()
    };

    const result = await bookingsCollection.insertOne(newBooking);

    // Update room bookingCount
    await roomsCollection.updateOne(
      { _id: new ObjectId(roomId) },
      { $inc: { bookingCount: 1 } }
    );

    // Challenge 7.3: Use $push to manage user bookings array (assuming we add a 'bookings' array to the user document)
    const usersCollection = db.collection('users');
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.id) },
      { $push: { bookings: result.insertedId.toString() } }
    );

    res.status(201).json({ message: 'Room booked successfully!', bookingId: result.insertedId });
  } catch (error) {
    console.error('Error booking room:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH cancel a booking (Private)
router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const bookingId = new ObjectId(req.params.id);
    const booking = await bookingsCollection.findOne({ _id: bookingId });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized: Cannot cancel someone else\'s booking' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }

    // Check if date is in the past (optional strictness, but prompt says "if booking date is in future")
    const bookingDate = new Date(booking.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // reset time to start of day

    if (bookingDate < today) {
      return res.status(400).json({ message: 'Cannot cancel past bookings' });
    }

    // Cancel booking
    await bookingsCollection.updateOne(
      { _id: bookingId },
      { $set: { status: 'cancelled' } }
    );

    // Challenge 7.3: Use $pull to remove booking ID from user's bookings array
    const usersCollection = db.collection('users');
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.id) },
      { $pull: { bookings: bookingId.toString() } }
    );

    res.status(200).json({ message: 'Booking cancelled' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

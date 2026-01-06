require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const propertyRoutes = require('./routes/properties');
const reviewRoutes = require('./routes/reviews');
const subscriptionRoutes = require('./routes/subscriptions');
const searchRoutes = require('./routes/search');
const favoriteRoutes = require('./routes/favorites');
const analyticsRoutes = require('./routes/analytics');
const hostProfilesRoutes =require("./routes/hostProfiles.js") ;
const hostMessagesRoutes = require("./routes/hostMessages");


connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Mount routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/properties', propertyRoutes);
app.use('/properties', reviewRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/search', searchRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/favorites", favoriteRoutes);
app.use("/host", hostProfilesRoutes);
app.use("/host-messages", hostMessagesRoutes);


// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

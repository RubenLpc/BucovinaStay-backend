// server/controllers/analyticsController.js
exports.impression = async (req, res) => {
    // { listingIds: [] }
    // production: pui într-un queue / db, dar aici doar ok
    res.status(204).send();
  };
  
  exports.click = async (req, res) => {
    // { listingId }
    res.status(204).send();
  };
  
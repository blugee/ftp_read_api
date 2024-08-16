const express = require("express");
const { getCreditData, getInvoices } = require("../Controller/Controller");

const router = express.Router();

router.get("/get-credits-data", getCreditData);
router.get("/get-invoices-data", getInvoices);

module.exports = router;
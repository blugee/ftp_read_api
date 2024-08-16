const express = require("express");
const cors = require('cors');
const PORT = 8002;

const routes = require("./Routes/index");

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb', extended: true }));
app.use(express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }));

app.get('/', (Request, Response) => {
    Response.send("Welcome to Nodejs app");
});

app.use("/", routes);

app.listen(PORT, () => {
    console.log(`Server is up and running on port ${PORT}.`);
})
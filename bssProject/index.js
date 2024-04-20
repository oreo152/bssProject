import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import googleStrategy from "passport-google-oauth2";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000*60*60*24,
    }
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port:process.env.PG_PORT,
});

db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(bodyParser.json());

app.get("/", (req,res) =>{
    res.render("home.ejs");
})

app.get("/userLogin", (req, res) => {
  res.render("userLogin.ejs");
});

app.get("/userRegister", (req, res) => {
  res.render("userRegister.ejs");
});

app.get("/managerLogin", (req, res) => {
    res.render("managerLogin.ejs");
});

app.get("/user", (req,res) => {
    if (req.isAuthenticated){
        res.render("user.ejs");
    }
    else{
        res.render("userLogin.ejs")
    }
});

app.get(
    "/auth/google",
    passport.authenticate("google", {
      scope: ["email"],
    })
  );

app.get("/manager",async (req,res) => {
    try {
      const todayAppointmentsQuery = "SELECT * FROM customers WHERE date = CURRENT_DATE";
      const todayAppointmentsResult = await db.query(todayAppointmentsQuery);
      const pendingAppointments = todayAppointmentsResult.rowCount;
     
      const totalCasesQuery = "SELECT COUNT(*) FROM customers";
      const totalCasesResult = await db.query(totalCasesQuery);
      const totalCases = totalCasesResult.rows[0].count;
  
  
      const customersQuery = "SELECT * FROM customers WHERE date = CURRENT_DATE";
      const customersResult = await db.query(customersQuery);
      const customers = customersResult.rows;
      
      const allcustomersQuery = "SELECT DISTINCT username, name FROM customers";
      const allcustomersresult = await db.query(allcustomersQuery)
      const allcustomers = allcustomersresult.rows;

      const employeeResult = await db.query('SELECT * FROM Employees');
      const employees = employeeResult.rows;

      res.render("manager.ejs", { 
        pendingAppointments: pendingAppointments,
        totalCases: totalCases,
        customers: customers,
        allcustomers: allcustomers,
        employees: employees
      });
    }catch (error) {
      console.error("Error fetching patient data:", error);
      res.status(500).send("Internal Server Error");
    }
     
});

app.get("/user/:username", async (req, res) => {
    const username = req.params.username;

    try {
      const prevQuery = "SELECT * FROM customers WHERE username = $1"; // OFFSET 0 LIMIT (SELECT COUNT(*) - 1 FROM customers WHERE username = $1)";
      const prevResult = await db.query(prevQuery, [username]);
      const prev = prevResult.rows;
      

      res.render("user.ejs",{
        username: username, prev: prev 
      });
    } catch (error) {
      console.error("Error fetching patient data:", error);
      res.status(500).send("Internal Server Error");
    }
  });

app.get("/PatientRecord/:username", async(req,res) => {
  const username = req.params.username;
  try {
    const PatientRecordQuery = "SELECT * FROM customers where username = $1";
    const PatientRecordResult = await db.query(PatientRecordQuery,[username]);
    const PatientRecord = PatientRecordResult.rows;

    res.render("PatientRecord.ejs",{
      PatientRecord: PatientRecord,
    });
    
  } catch (error) {
    console.error("Error fetching patient data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/managerLogin", async (req, res) => {
  const username = req.body.username;
  const loginPassword = req.body.password;

  try {
    const result = await db.query("SELECT * FROM managers WHERE username = $1", [username]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedPassword = user.password;

      if (loginPassword === storedPassword) {
        res.redirect('/manager');
      } else {
        res.render("managerLogin.ejs", { errorMessage: "Incorrect password" });
      }
    } else {
      res.render("managerLogin.ejs", { errorMessage: "User not found" });
    }
  } catch (err) {
    console.error("Error fetching manager data:", err);
    res.render("managerLogin.ejs", { errorMessage: "Internal Server Error" });
  }
});

app.post("/userRegister", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM customers WHERE username = $1", [
      username,
    ]);

    if (checkResult.rows.length > 0) {
      res.send("username already exists. Try logging in.");
    } else {
        bcrypt.hash(password, saltRounds, async (err, hash) => {
            if (err) {
              console.error("Error hashing password:", err);
            } else {
              await db.query(
                "INSERT INTO customers (username, password) VALUES ($1, $2) RETURNING",
                [username, hash]
              );
              const user = result.rows[0];
              req.login(user,(err)=>{
                console.log(err);
                res.redirect("/user");
              })
            }
          });
      res.redirect("/userLogin");
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/userLogin", passport.authenticate("local", {
  successRedirect: "/user",
  failureRedirect: "/login",
}));
  

app.post("/book-appointment", async (req, res) => {
    
    const {username, name, age, gender, phone, doctor, date, message } = req.body;
    
    
    try {
        const result = await db.query("INSERT INTO customers (username, name, age, gender, phone, doctor, date, message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [username, name, age, gender, phone, doctor, date, message]);
        const MaxId = await db.query("SELECT MAX(id) FROM customers");
        const id = MaxId.rows[0].max;
        console.log(id);
        
        await db.query ("INSERT INTO customers (id,username, name, age, gender, phone, doctor, date, message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [ id, username, name, age, gender, phone, doctor, date, message]);
        
        res.send("Appointment booked successfully!");
    } catch (error) {
        console.error("Error booking appointment:", error);
    }
});

passport.use("local",new Strategy(async function verify(username, password,cb){
    try {
        const result = await db.query("SELECT * FROM customers WHERE username = $1", [username]);
    
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedPassword = user.password;
    
          bcrypt.compare(password, storedPassword, (err, result) => {
            if (err) {
              return cb(err);
            } else {
              if (result) {
                return cb(null,user);
              } else {
                return cb(null,false);
              }
            }
          });
        } else {
          return cb("User not found");
        }
      } catch (err) {
        return cb(err);
      }
}));

passport.use(
    "google", 
new Strategy (
    {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google",
    profileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
}, async (acessToken, refreshToken, profile, cb) =>{
    console.log(profile);
}
))

passport.serializeUser((user,cb)=>{
    cb(null,user);
})
passport.deserializeUser((user,cb)=>{
    cb(null,user);
})



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

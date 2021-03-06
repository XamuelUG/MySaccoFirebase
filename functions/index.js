const functions = require("firebase-functions");
const express = require("express");
const engines = require("consolidate");
const admin = require("firebase-admin");
const shortid = require("shortid");
const nodemailer = require("nodemailer");
const schedule = require("node-schedule");
const { user } = require("firebase-functions/lib/providers/auth");
const e = require("express");

const app = express();
app.engine("hbs", engines.handlebars);
app.set("views", "./views");
app.set("view engine", "hbs");

//db stuff
admin.initializeApp(functions.config().firebase);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const db = admin.firestore();
const saccoCollection = db.collection("saccos");
const savingsCollection = db.collection("savings");
const loansCollection = db.collection("loans");
//db stuff
//email transporter
var transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  auth: {
    user: "mail.mysacco@gmail.com",
    pass: "martha256",
  },
});
//email transporter

//routes
app.get("/", (req, res) => {
  res.render("index", { sacco: "sam" });
});
app.get("/loan-request", (req, res) => {
  res.render("loan-request", { sacco: "sam" });
});
app.get("/home", async (req, res) => {
  res.render("home");
});
app.get("/save", (req, res) => {
  res.render("save", { sacco: "sam" });
});

app.get("/new-sacco", (req, res) => {
  res.render("new-sacco", { sacco: "sam" });
});
app.get("/login", (req, res) => {
  res.render("login", { sacco: "sam" });
});
app.get("/register", (req, res) => {
  res.render("register", { sacco: "sam" });
});
//routes

app.get("/admin", (req, res) => {
  res.render("admin");
});
app.get("/saccos", (req, res) => {
  res.render("saccos");
});
app.get("/pending-saccos", async (req, res) => {
  let saccoSnapShot = await saccoCollection.get();
  let pending_saccos = [];
  saccoSnapShot.forEach((sacco) => {
    let sacco_data = sacco.data();
    if (
      !Object.values(sacco_data.saccoMembers).find(
        (member) => member.confirmed == false
      ) &&
      sacco_data.confirmed == false
    ) {
      pending_saccos.push(sacco_data);
    }
  });
  res.render("pending-saccos", { pending_saccos });
});

app.post("/api/new-sacco", async (req, res) => {
  let members = {};
  for (let i = 1; i <= parseInt(req.body.members_number); i++) {
    members[`member_${i}`] = {
      memberId: req.body[`member_number_${i}`],
      memberName: req.body[`member_name_${i}`],
      memberEmail: req.body[`member_email_${i}`],
      memberPhone: req.body[`member_phone_${i}`],
      confirmed: false,
      password: null,
      member_savings: null,
      member_loans: null,
    };
  }
  let saccoId = "Sacco-" + shortid.generate();
  let newSacco = {
    sacco_savings: null,
    saccoId,
    confirmed: false,
    saccoName: req.body.sacco_name,
    numberOfMembers: parseInt(req.body.members_number),
    minSaving: parseInt(req.body.min_saving),
    meetingDay: req.body.meeting_day,
    meetingTime: {
      start: req.body.s_meeting_time,
      end: req.body.e_meeting_time,
    },
    period: req.body.s_period,
    saccoMembers: members,
  };
  try {
    const registeredSacco = await saccoCollection.doc(saccoId).set(newSacco);
    let mail = {
      from: '"MySacco Uganda" <mail.mysacco@gmail.com>',
      to: `${members[`member_1`].memberEmail}`,
      subject: `Sacco ID for ${req.body.sacco_name} `,
      text: `Hello ${
        members[`member_1`].memberName
      } , Your Sacco Id is ${saccoId}.
      Your members should be registered before your sacco is confirmed`,
    };
    transporter.sendMail(mail, (err) => {
      if (err) {
        throw err;
      }
    });
    let date = new Date();
    let newDate = new Date(
      date.setMonth(date.getMonth() + parseInt(req.body.s_period))
    );
    schedule.scheduleJob(newDate, await getSaccoData(saccoId));
    res.render("registered-sacco");
  } catch (error) {
    res.status(400).send("An Error: " + error);
  }
});

//db stuff

//register
app.post("/api/register", async (req, res) => {
  try {
    let saccoReq = await saccoCollection.doc(req.body.sacco_id).get();
    if (!saccoReq.exists) {
      res.send("noSacco");
    } else {
      let saccoData = saccoReq.data();
      saccoData.saccoMembers[
        `member_${req.body.member_number}`
      ].confirmed = true;
      saccoData.saccoMembers[`member_${req.body.member_number}`].password =
        req.body.password;
      const registeredSacco = await saccoCollection
        .doc(req.body.sacco_id)
        .set(saccoData);
      res.send("No Error");
    }
  } catch (error) {
    res.send("Error");
  }
});
//register

//admin
app.put("/api/confirm/:id", (req, res) => {
  try {
    let pending_sacco = saccoCollection
      .doc(req.params.id)
      .update({ confirmed: true });
    res.send("confirmed");
  } catch (error) {
    throw error;
  }
});
//admin
//user login
app.post("/api/user/login", async (req, res) => {
  try {
    let user_sacco = await saccoCollection.doc(req.body.sacco_id).get();
    function timeConfig(saccoData) {
      let dateRef = new Date();
      let day = saccoData.meetingDay,
        numberDay;
      switch (day) {
        case "Sunday":
          numberDay = 0;
          break;
        case "Monday":
          numberDay = 1;
          break;
        case "Tuesday":
          numberDay = 2;
          break;
        case "Wednesday":
          numberDay = 3;
          break;
        case "Thursday":
          numberDay = 4;
          break;
        case "Friday":
          numberDay = 5;
          break;
        case "Saturday":
          numberDay = 6;
          break;
        default:
          numberDay = 6;
          break;
      }
      if (dateRef.getDay() != numberDay) {
        return false;
      }
    }
    if (!user_sacco.exists) {
      res.send("Sacco Does Not Exist");
      return;
    } else if (user_sacco.data().confirmed != true) {
      res.send("Sacco Not Confirmed");
      return;
    } else if (timeConfig(user_sacco.data()) == false) {
      res.send("Not The Saving Day");
    } else if (
      !user_sacco.data().saccoMembers[`member_${req.body.member_number}`]
    ) {
      res.send("User Not Found");
      return;
    } else if (
      user_sacco.data().saccoMembers[`member_${req.body.member_number}`]
        .password != req.body.password
    ) {
      res.send("Wrong PassWord");
      return;
    } else {
      res.send({
        member_number: req.body.member_number,
        sacco_id: req.body.sacco_id,
      });
    }
  } catch (error) {
    throw error;
  }
});
//user login

//user data for home page
app.get("/api/user/:saccoId/:memberId", async (req, res) => {
  try {
    let user_sacco = await saccoCollection.doc(req.params.saccoId).get();
    let user_savings = await saccoCollection
      .doc(`${req.params.saccoId}_${req.params.memberId}`)
      .get();
    let user_loans = await saccoCollection
      .doc(`${req.params.saccoId}_${req.params.memberId}`)
      .get();
    let user_member = user_sacco.data().saccoMembers[
      `member_${req.params.memberId}`
    ];
    let cp = req.params.memberId == 1 ? true : false;
    let user_sacco_data = user_sacco.data();
    let user_loans_data = user_loans.data() || null;
    let user_savings_data = user_savings.data();
    res.send({
      cp,
      user_member,
      user_sacco_data,
      user_savings_data,
      user_loans_data,
    });
  } catch (error) {
    res.send("An error happened");
  }
});
//user data for home page

//savings
//api function
function apiGetSaving(number, amount) {
  /**
   * this function will take in the mobile number
   * and the amount to be saved.
   * These will later be sent to the MTN mobile Money Api
   * and a transaction will be made.
   *
   * Afterward, its will return the amount and transction Id
   */
  return { transactionId: "generatedByMtn", saved: amount };
}
app.post("/api/user/save", async (req, res) => {
  //api
  let apiResult = apiGetSaving(req.body.mobile_number, req.body.save_amount);
  if (apiResult != false) {
    try {
      let user_sacco = await saccoCollection.doc(req.body.sacco_id).get();
      let user_member = user_sacco.data().saccoMembers[
        `member_${req.body.member_number}`
      ];
      let sacco_savings = user_sacco.data().saccoSavings || 0;
      if (
        user_member.member_savings == null ||
        user_member.member_savings == undefined
      ) {
        user_member.member_savings = [
          { date: Date.now(), amount: apiResult.saved },
        ];
        sacco_savings += parseInt(apiResult.saved);
      } else {
        user_member.member_savings.push({
          date: Date.now(),
          amount: apiResult.saved,
        });
        sacco_savings += parseInt(apiResult.saved);
      }
      let user_sacco_data = user_sacco.data();
      user_sacco_data.saccoMembers[
        `member_${req.body.member_number}`
      ] = user_member;
      user_sacco_data.saccoSavings = sacco_savings;
      await saccoCollection.doc(req.body.sacco_id).set(user_sacco_data);
      res.send("saved");
    } catch (error) {
      console.log("error: ", error);
      throw error;
    }
  } else {
    res.send("error on api request");
  }
  //api
});
//api function
//savings

//loans
app.post("/api/user/loan", async (req, res) => {
  try {
    let loanId = `${req.body.sacco_id}_${req.body.member_number}`;
    let user_loans = await loansCollection.doc(loanId).get();
    if (!user_loans.exists) {
      await loansCollection.doc(loanId).set({
        sacco_id: req.body.sacco_id,
        member_id: req.body.member_number,
        loans: [
          {
            date: Date.now(),
            loanAmount: req.body.loan_amount,
            loanStatus: "pending",
          },
        ],
      });
    } else {
      let loans = user_loans.data().loans;
      loans.push({
        date: Date.now(),
        loanAmount: req.body.loan_amount,
        loanStatus: "pending",
      });
      await loansCollection.doc(loanId).set({
        sacco_id: req.body.sacco_id,
        member_id: req.body.member_number,
        loans,
      });
    }
    res.send("Loan Requested");
  } catch (error) {
    throw error;
  }
  //api
});
//loans
async function getSaccoData(i) {
  let sacco = await saccoCollection.doc(i).get();
  _disburs(sacco.data());
}
//this function does the disbursment after the sacco period
function _disburs(sacco_data) {
  let members = sacco_data.saccoMembers;
  members.forEach((member) => {
    let total_savings = 0;
    let savings = member.member_savings;
    if (savings != null || savings != undefined) {
      savings.forEach((saving) => {
        total_savings += parseInt(saving.amount);
      });
    }
    apiDisburse(member.memberPhone, total_savings);
  });
}
//this function does the disbursment after the sacco period

/*
this function below makes the disbursment of money to member mobile accounts after
the sacco period
*/
function apiDisburse(number, amount) {
  /**
   * this function will take in the mobile number
   * and the amount to be saved.
   * These will later be sent to the MTN mobile Money Api
   * a disbursment will be done
   *
   * Afterward, its will return true if the transaction was successfull
   */
  return { transactionId: "generatedByMtn", recieved: true };
}
/*
this function makes the disbursment of money to member mobile accounts after
the sacco period
*/
exports.app = functions.https.onRequest(app);

const router = require("express").Router();
const Members = require("../models/members-model.js");
const Confirmations = require("../models/confirmations-model.js");
const crypto = require("crypto");
const sendMail = require("../middleware/sendMail.js");
const templates = require("../middleware/emailTemplates.js");
const { generateToken } = require("../middleware/token.js");

router.get("/", async (req,res) => {
  try {
    const request = Members;
    res.status(200).json(request);
  } catch {
    res.status(500).json({Message: "Something went wrong."})
  }
})

router.get("/household", async (req, res) => {
  const householdId = req.decodedToken.current_household;
  console.log(householdId);
  try {
    const members = await Members.findHouseholdMembers(householdId);
    const children = await Members.childrenPerHousehold(householdId);
    for (let member of members) {
      member.children = children;
    }

    res.status(200).json(members);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message, location: "members-router.js 9" });
  }
});

router.get("/household/assignable", async (req, res) => {
  const householdId = req.decodedToken.current_household;
  try {
    const members = await Members.totalHouseholdMembers(householdId);
    const children = await Members.totalHouseholdChildren(householdId);
    // res.status(200).json([...members, ...children]);
    res.status(200).json({ members, children });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/household/children/:childId", async (req, res) => {
  try {
    const request = await Members.getChildById(req.params.childId);
    res.status(200).json(request);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/household/children", async (req, res) => {
  const householdId = req.decodedToken.current_household;
  try {
    req.body.household_id = householdId;
    const request = await Members.addChild(req.body);
    res.status(200).json(request);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/household/children/:childId", async (req, res) => {
  try {
    const request = await Members.updateChild(req.params.childId, req.body);
    res.status(200).json(request);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/household/children/:childId", async (req, res) => {
  try {
    const request = await Members.removeChild(req.params.childId);
    res.status(200).json(request);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/household/invite", async (req, res, next) => {
  const { email } = req.body;
  const householdId = req.decodedToken.current_household;
  if (email && householdId) {
    Members.getByEmail(email)
      .then(member => {
        const newConfirmation = {
          member_id: member.id,
          hash: crypto.randomBytes(20).toString("hex")
        };
        Confirmations.insert(newConfirmation).then(hash => {
          sendMail(member.email, templates.householdInvite(hash, householdId));
          res.status(200).json({
            message: `An invitation email has been sent to ${member.email}`
          });
        });
      })
      .catch(err => {
        res.status(400).json({
          message: "A user with that email address does not exist.",
          err
        });
      });
  } else {
    res.status(400).json({ message: "Please enter an email address." });
  }
});

router.put("/", (req, res, next) => {
  const id = req.decodedToken.subject;
  if (req.body.hash) {
    Confirmations.getByHash(req.body.hash).then(confirmation => {
      if (confirmation.member_id === id) {
        Members.update(id, { current_household: req.body.householdId })
          .then(async member => {
            const token = await generateToken(member[0]);
            res.status(200).json({ member, token });
          })
          .catch(err => {
            next(err);
          });
      }
    });
  } else {
    Members.update(id, req.body)
      .then(async member => {
        const token = await generateToken(member[0]);
        res.status(200).json({ member, token });
      })
      .catch(err => {
        next(err);
      });
  }
});


// update information about user
router.put("/update-info", (req, res, next) => {
  const id = req.decodedToken.subject;
  Members.update(id, req.body)
    .then(updatedInfo => {
      res.status(200).json(updatedInfo[0]);
    })
    .catch(err => {
      next(err);
    });
})

// the endpoint the user hits when trying to update their email
router.put("/update-email", (req, res, next) => {
  const { email, memberId } = req.body;
  if (!email) {
    res.status(404).json({ message: "Please dont leave email field blank." })
  }
  const hash = crypto.randomBytes(20).toString("hex");
  console.log(email, memberId)
  Confirmations.insert({ member_id: memberId, hash, email })
    .then(hash => {
      sendMail(email, templates.newEmail(hash))
      res.status(200).json({ message: `An email has been sent to ${email} for confirmation.`})
    })
    .catch(err => {
      next(err);
    })
})

router.put("/confirm-new-email", (req, res, next) => {
  const { hash } = req.body;
  // check to see if the hash in in the confirmations table - if it is then we can officially update the users email
  Confirmations.getByHash(hash)
    .then(confirmation => {
      Members.update(confirmation.member_id,{ email: confirmation.email })
        .then(memberInfo => {
          console.log(memberInfo)
          const { email } = memberInfo[0]
          res.status(200).json({
            message: `New email has been confirmed!`,
            email: email,
          });

        })
    })
    .catch(err => {
      next(err);
    })
})

module.exports = router;

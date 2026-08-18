const router = require("express").Router();
const authenticate = require("../middlewares/authenticate");
const controller = require("../controllers/notification.controller");

router.use(authenticate);
router.get("/", controller.list);
router.patch("/:notificationId/read", controller.markRead);
router.patch("/:notificationId/dismiss", controller.dismiss);
router.post("/read-all", controller.markAllRead);
router.post("/dismiss-all", controller.dismissAll);
module.exports = router;

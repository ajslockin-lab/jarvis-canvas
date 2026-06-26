import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import canvasRouter from "./canvas";
import userRouter from "./user";
import voiceRouter from "./voice";
import extensionRouter from "./extension";
import remindersRouter from "./reminders";
import errorsRouter from "./errors";
import pushRouter from "./push";
import chatRouter from "./chat";
import calendarRouter from "./calendar";
import notesRouter from "./notes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(canvasRouter);
router.use(userRouter);
router.use(voiceRouter);
router.use(extensionRouter);
router.use(remindersRouter);
router.use(errorsRouter);
router.use(pushRouter);
router.use(chatRouter);
router.use(calendarRouter);
router.use(notesRouter);

export default router;

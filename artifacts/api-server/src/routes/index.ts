import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import canvasRouter from "./canvas";
import userRouter from "./user";
import voiceRouter from "./voice";
import extensionRouter from "./extension";
import remindersRouter from "./reminders";
import errorsRouter from "./errors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(canvasRouter);
router.use(userRouter);
router.use(voiceRouter);
router.use(extensionRouter);
router.use(remindersRouter);
router.use(errorsRouter);

export default router;

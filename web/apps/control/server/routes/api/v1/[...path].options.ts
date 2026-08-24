import { defineHandler } from "nitro";
import { noContentResponse } from "../../../http/responses";

export default defineHandler(() => noContentResponse());

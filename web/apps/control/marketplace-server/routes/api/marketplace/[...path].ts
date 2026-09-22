import { defineHandler } from "nitro";
import { marketplaceApi } from "../../../marketplace-api";

export default defineHandler((event) => marketplaceApi(event.req));

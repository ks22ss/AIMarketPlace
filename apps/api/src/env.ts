import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const directory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(directory, "../../../.env") });
dotenv.config({ path: path.resolve(directory, "../../.env") });

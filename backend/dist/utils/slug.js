"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueSlug = exports.generateSlug = void 0;
const slugify_1 = __importDefault(require("slugify"));
const generateSlug = (text) => {
    return (0, slugify_1.default)(text, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g,
    });
};
exports.generateSlug = generateSlug;
const generateUniqueSlug = (text, existingSlugs) => {
    let baseSlug = (0, exports.generateSlug)(text);
    let slug = baseSlug;
    let counter = 1;
    while (existingSlugs.includes(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return slug;
};
exports.generateUniqueSlug = generateUniqueSlug;
//# sourceMappingURL=slug.js.map
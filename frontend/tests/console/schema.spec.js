"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var test_1 = require("@playwright/test");
var SCHEMA_REGISTRY_TABLE_NAME_TESTID = 'schema-registry-table-name';
/**
 * This test is depentent on a certain owlshop-data configuration.
 */
test_1.test.describe('Schema', function () {
    (0, test_1.test)('should filter on schema ID', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var _c, _d;
        var page = _b.page;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    page.setDefaultTimeout(10000);
                    // Let's search for 7
                    return [4 /*yield*/, page.goto('/schema-registry')];
                case 1:
                    // Let's search for 7
                    _e.sent();
                    return [4 /*yield*/, page.getByPlaceholder('Filter by subject name or schema ID...').fill('7')];
                case 2:
                    _e.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor()];
                case 3:
                    _e.sent();
                    _c = test_1.expect;
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()];
                case 4:
                    _c.apply(void 0, [_e.sent()]).toEqual(1);
                    // Let's search for 1
                    return [4 /*yield*/, page.getByPlaceholder('Filter by subject name or schema ID...').fill('1')];
                case 5:
                    // Let's search for 1
                    _e.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Customer').waitFor()];
                case 6:
                    _e.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor()];
                case 7:
                    _e.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('shop/v1/address.proto').waitFor()];
                case 8:
                    _e.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('shop/v1/customer.proto').waitFor()];
                case 9:
                    _e.sent();
                    _d = test_1.expect;
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()];
                case 10:
                    _d.apply(void 0, [_e.sent()]).toEqual(4);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)("should show 'Schema search help'", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: 
                // Let's search for 7
                return [4 /*yield*/, page.goto('/schema-registry')];
                case 1:
                    // Let's search for 7
                    _c.sent();
                    return [4 /*yield*/, page.getByTestId('schema-search-help').click()];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, page.getByTestId('schema-search-header').waitFor()];
                case 3:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should filter on schema name', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var _c;
        var page = _b.page;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: 
                // Let's search for 7
                return [4 /*yield*/, page.goto('/schema-registry')];
                case 1:
                    // Let's search for 7
                    _d.sent();
                    return [4 /*yield*/, page.getByPlaceholder('Filter by subject name or schema ID...').fill('com.shop.v1.avro.Address')];
                case 2:
                    _d.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor({
                            timeout: 1000,
                        })];
                case 3:
                    _d.sent();
                    _c = test_1.expect;
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()];
                case 4:
                    _c.apply(void 0, [_d.sent()]).toEqual(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should filter on schema name by regexp', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var _c;
        var page = _b.page;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: 
                // Let's search for 7
                return [4 /*yield*/, page.goto('/schema-registry')];
                case 1:
                    // Let's search for 7
                    _d.sent();
                    return [4 /*yield*/, page.getByPlaceholder('Filter by subject name or schema ID...').fill('com.shop.v[1-8].avro')];
                case 2:
                    _d.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor({
                            timeout: 1000,
                        })];
                case 3:
                    _d.sent();
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Customer').waitFor({
                            timeout: 1000,
                        })];
                case 4:
                    _d.sent();
                    _c = test_1.expect;
                    return [4 /*yield*/, page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()];
                case 5:
                    _c.apply(void 0, [_d.sent()]).toEqual(2);
                    return [2 /*return*/];
            }
        });
    }); });
});

"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var test_1 = require("@playwright/test");
var acl_model_1 = require("../../src/components/pages/acls/new-acl/acl.model");
var acl_page_1 = require("../console/utils/acl-page");
var role_page_1 = require("../console/utils/role-page");
/**
 * Generates a unique principal name for testing
 */
function generatePrincipalName() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var hour = String(now.getHours()).padStart(2, '0');
    var dateStr = "".concat(year).concat(month).concat(hour);
    var randomStr = Math.random().toString(36).substring(2, 5);
    return "e2e-acl-".concat(dateStr, "-").concat(randomStr);
}
var aclPages = [
    { type: 'Acl', createPage: function (page) { return new acl_page_1.AclPage(page); } },
    { type: 'Role', createPage: function (page) { return new role_page_1.RolePage(page); } },
];
test_1.test.describe('ACL Creation', function () {
    [
        {
            testName: 'should set operations and it should be present in resume component',
            principal: generatePrincipalName(),
            host: '*',
            operation: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 3,
                    resourceType: acl_model_1.ResourceTypeTransactionalId,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 4,
                    resourceType: acl_model_1.ResourceTypeSubject,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 5,
                    resourceType: acl_model_1.ResourceTypeSchemaRegistry,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
        },
        {
            testName: 'should set operations for schema',
            principal: generatePrincipalName(),
            host: '10.0.0.1',
            operation: [
                {
                    id: 4,
                    resourceType: acl_model_1.ResourceTypeSubject,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                        ALTER_CONFIGS: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeSchemaRegistry,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeAllow,
                        ALTER_CONFIGS: acl_model_1.OperationTypeAllow,
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
        },
    ].map(function (_a) {
        var testName = _a.testName, principal = _a.principal, host = _a.host, operation = _a.operation;
        aclPages.map(function (_a) {
            var createPage = _a.createPage, type = _a.type;
            (0, test_1.test)("".concat(testName, " - ").concat(type), function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
                var aclPage;
                var page = _b.page;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            aclPage = createPage(page);
                            return [4 /*yield*/, aclPage.goto()];
                        case 1:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Set principal and host', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.setPrincipal(principal)];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.setHost(host)];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 2:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Configure all rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.configureRules(operation)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 3:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify the summary shows the correct operations', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllSummaryRules(operation)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 4:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Submit the form', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.submitForm()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 5:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Wait for navigation to detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.waitForDetailPage()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 6:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify ACL Rules count matches', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateRulesCount(operation.length)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 7:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Add small delay for stability', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.waitForStability(100)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 8:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Check the Detail page - verify all rules are present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllDetailRules(operation, principal, host)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 9:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify shared configuration is present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateSharedConfig()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 10:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify the created ACL/role appears in the list using specific test ID', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateListItem(host, principal)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 11:
                            _c.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    });
});
test_1.test.describe('ACL Update', function () {
    /**
     * Test cases for ACL Update functionality
     * Each test:
     * 1. Creates initial ACL with specific rules
     * 2. Navigate to update page
     * 3. Modifies the rules (add/remove/change)
     * 4. Validates the changes on detail page
     */
    [
        {
            testName: 'should add a new rule to existing ACL',
            principal: generatePrincipalName(),
            host: '*',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeAny,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeAny,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            updatedRules: [
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                        DELETE: acl_model_1.OperationTypeDeny,
                    },
                },
            ],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeAny,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeAny,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                        DELETE: acl_model_1.OperationTypeDeny,
                    },
                },
            ],
            removedRules: [],
        },
        {
            testName: 'should remove a rule from existing ACL',
            principal: generatePrincipalName(),
            host: '192.168.1.100',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            updatedRules: [],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            removedRules: [
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
        },
        {
            testName: 'should update rule mode from Custom to Allow All and Deny All',
            principal: generatePrincipalName(),
            host: '*',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeDeny,
                        ALTER: acl_model_1.OperationTypeAllow,
                        ALTER_CONFIGS: acl_model_1.OperationTypeDeny,
                        CLUSTER_ACTION: acl_model_1.OperationTypeAllow,
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeDeny,
                        IDEMPOTENT_WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeDeny,
                        WRITE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeDeny,
                        DELETE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                        ALTER_CONFIGS: acl_model_1.OperationTypeAllow,
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeDeny,
                    },
                },
            ],
            updatedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeAllowAll,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {},
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeDenyAll,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {},
                },
            ],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeAllowAll,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        ALL: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeDenyAll,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        ALL: acl_model_1.OperationTypeDeny,
                    },
                },
            ],
            removedRules: [],
        },
        {
            testName: 'should update rule mode from Allow All and Deny All to Custom',
            principal: generatePrincipalName(),
            host: '10.0.0.0',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeAllowAll,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {},
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeDenyAll,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {},
                },
            ],
            updatedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeDeny,
                        ALTER: acl_model_1.OperationTypeAllow,
                        ALTER_CONFIGS: acl_model_1.OperationTypeDeny,
                        CLUSTER_ACTION: acl_model_1.OperationTypeAllow,
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeDeny,
                        IDEMPOTENT_WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeDeny,
                        WRITE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeDeny,
                        DELETE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                        ALTER_CONFIGS: acl_model_1.OperationTypeAllow,
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeDeny,
                    },
                },
            ],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeDeny,
                        ALTER: acl_model_1.OperationTypeAllow,
                        ALTER_CONFIGS: acl_model_1.OperationTypeDeny,
                        CLUSTER_ACTION: acl_model_1.OperationTypeAllow,
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeDeny,
                        IDEMPOTENT_WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeDeny,
                        WRITE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeDeny,
                        DELETE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                        ALTER_CONFIGS: acl_model_1.OperationTypeAllow,
                        DESCRIBE_CONFIGS: acl_model_1.OperationTypeDeny,
                    },
                },
            ],
            removedRules: [],
        },
        {
            testName: 'should modify operations on existing rules',
            principal: generatePrincipalName(),
            host: '*',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            updatedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeDeny, // Changed from Allow to Deny
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeAllow, // Added new operation
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeDeny, // Changed from Allow to Deny
                        WRITE: acl_model_1.OperationTypeAllow, // Added new operation
                    },
                },
            ],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeDeny,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeDeny,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            removedRules: [],
        },
        {
            testName: 'should update selectorValue for different resource types and selector patterns',
            principal: generatePrincipalName(),
            host: '172.16.0.0',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'orders-topic',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypePrefix,
                    selectorValue: 'analytics-',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            updatedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypePrefix,
                    selectorValue: 'events-',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'user-profile-updates',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypePrefix,
                    selectorValue: 'events-',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypePrefix,
                    selectorValue: 'analytics-',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'user-profile-updates',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 3,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'orders-topic',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            removedRules: [],
        },
        {
            testName: 'should handle complex update with additions and removals',
            principal: generatePrincipalName(),
            host: '*',
            initialRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypePrefix,
                    selectorValue: 'topic-',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            updatedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup, // Changed resource_type
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeSubject,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeSchemaRegistry,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            removedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypePrefix,
                    selectorValue: 'topic-',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            expectedRules: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeSubject,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeSchemaRegistry,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
        },
    ].map(function (_a) {
        var testName = _a.testName, principal = _a.principal, host = _a.host, initialRules = _a.initialRules, updatedRules = _a.updatedRules, expectedRules = _a.expectedRules, _b = _a.removedRules, removedRules = _b === void 0 ? [] : _b;
        aclPages.map(function (_a) {
            var createPage = _a.createPage, type = _a.type;
            (0, test_1.test)("".concat(testName, " - ").concat(type), function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
                var aclPage;
                var page = _b.page;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            aclPage = createPage(page);
                            return [4 /*yield*/, aclPage.goto()];
                        case 1:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 1: Create initial ACL', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.goto()];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.setPrincipal(principal)];
                                            case 2:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.setHost(host)];
                                            case 3:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.configureRules(initialRules)];
                                            case 4:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.validateAllSummaryRules(initialRules)];
                                            case 5:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.submitForm()];
                                            case 6:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.waitForDetailPage()];
                                            case 7:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 2:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify initial ACL was created successfully', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateRulesCount(initialRules.length)];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.validateAllDetailRules(initialRules, principal, host)];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 3:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 2: Navigate to update page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.clickUpdateButtonFromDetailPage()];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.waitForUpdatePage()];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 4:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 3: Validate existing rules are populated in update form', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllSummaryRules(initialRules)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 5:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 4: Update/add rules - updates existing rules or creates new ones', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.updateRules(updatedRules)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 6:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 4b: Delete rules that should be removed', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.deleteRules(removedRules)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 7:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Validate the summary shows all expected rules (initial + updated)', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllSummaryRules(expectedRules || __spreadArray(__spreadArray([], initialRules, true), updatedRules, true))];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 8:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 5: Submit the update', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.submitForm()];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.waitForDetailPage()];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 9:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Step 6: Verify the changes on detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    var finalRules;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                finalRules = expectedRules || __spreadArray(__spreadArray([], initialRules, true), updatedRules, true);
                                                return [4 /*yield*/, aclPage.validateRulesCount(finalRules.length)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 10:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify all expected rules are present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    var finalRules;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                finalRules = expectedRules || __spreadArray(__spreadArray([], initialRules, true), updatedRules, true);
                                                return [4 /*yield*/, aclPage.validateAllDetailRules(finalRules, principal, host)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 11:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify removed rules are not present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    var _i, removedRules_1, removedRule;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                _i = 0, removedRules_1 = removedRules;
                                                _a.label = 1;
                                            case 1:
                                                if (!(_i < removedRules_1.length)) return [3 /*break*/, 4];
                                                removedRule = removedRules_1[_i];
                                                return [4 /*yield*/, aclPage.validateRuleNotExists(removedRule, principal, host)];
                                            case 2:
                                                _a.sent();
                                                _a.label = 3;
                                            case 3:
                                                _i++;
                                                return [3 /*break*/, 1];
                                            case 4: return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 12:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify shared configuration is still present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateSharedConfig()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 13:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify the created ACL/role appears in the list using specific test ID', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateListItem(host, principal)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 14:
                            _c.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    });
});
test_1.test.describe('ACL Disable Rules Validation', function () {
    (0, test_1.test)('check disable rules', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var principal, host, rules, aclPage;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    principal = generatePrincipalName();
                    host = '*';
                    rules = [
                        {
                            id: 0,
                            resourceType: acl_model_1.ResourceTypeCluster,
                            mode: acl_model_1.ModeCustom,
                            selectorType: acl_model_1.ResourcePatternTypeLiteral,
                            selectorValue: 'kafka-cluster',
                            operations: {
                                DESCRIBE: acl_model_1.OperationTypeAllow,
                                CREATE: acl_model_1.OperationTypeAllow,
                            },
                        },
                        {
                            id: 1,
                            resourceType: acl_model_1.ResourceTypeSchemaRegistry,
                            mode: acl_model_1.ModeCustom,
                            selectorType: acl_model_1.ResourcePatternTypeLiteral,
                            selectorValue: '*',
                            operations: {
                                DESCRIBE: acl_model_1.OperationTypeAllow,
                                READ: acl_model_1.OperationTypeAllow,
                            },
                        },
                    ];
                    aclPage = new acl_page_1.AclPage(page);
                    return [4 /*yield*/, aclPage.goto()];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Set principal and host', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.setPrincipal(principal)];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, aclPage.setHost(host)];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Configure the first two rules (cluster and schema registry)', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.configureRules(rules)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Add a third rule to test disabled buttons', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.addNewRule()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Validate that cluster and schema registry buttons are disabled for the new rule (index 2)', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.validateResourceTypeButtonDisabled(2, 'cluster')];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, aclPage.validateResourceTypeButtonDisabled(2, 'schemaRegistry')];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Select a different resource type for the third rule (topic should be available)', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var newRule;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        newRule = {
                                            id: 2,
                                            resourceType: acl_model_1.ResourceTypeTopic,
                                            mode: acl_model_1.ModeCustom,
                                            selectorType: acl_model_1.ResourcePatternTypeLiteral,
                                            selectorValue: '*',
                                            operations: {
                                                DESCRIBE: acl_model_1.OperationTypeAllow,
                                                READ: acl_model_1.OperationTypeAllow,
                                            },
                                        };
                                        return [4 /*yield*/, aclPage.selectResourceType(2, newRule)];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, aclPage.configureRule(2, newRule)];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 6:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Validate the summary shows all configured rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var newRule;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        newRule = {
                                            id: 2,
                                            resourceType: acl_model_1.ResourceTypeTopic,
                                            mode: acl_model_1.ModeCustom,
                                            selectorType: acl_model_1.ResourcePatternTypeLiteral,
                                            selectorValue: '*',
                                            operations: {
                                                DESCRIBE: acl_model_1.OperationTypeAllow,
                                                READ: acl_model_1.OperationTypeAllow,
                                            },
                                        };
                                        return [4 /*yield*/, aclPage.validateAllSummaryRules(__spreadArray(__spreadArray([], rules, true), [newRule], false))];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Submit the form', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.submitForm()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 8:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Wait for navigation to detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.waitForDetailPage()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 9:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Verify ACL creation was successful', function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, aclPage.validateRulesCount(3)];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, aclPage.validateSharedConfig()];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 10:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Role membership', function () {
    [
        {
            testName: 'should set operations and it should be present in resume component',
            principal: generatePrincipalName(),
            host: '*',
            operation: [
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 2,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 3,
                    resourceType: acl_model_1.ResourceTypeConsumerGroup,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 4,
                    resourceType: acl_model_1.ResourceTypeTransactionalId,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 5,
                    resourceType: acl_model_1.ResourceTypeSubject,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        READ: acl_model_1.OperationTypeAllow,
                        WRITE: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 6,
                    resourceType: acl_model_1.ResourceTypeSchemaRegistry,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        READ: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
            addMembership: ['test-user-1', 'test-user-2'],
            deleteMembership: ['test-user-1', 'test-user-2'],
        },
    ].map(function (_a) {
        var testName = _a.testName, principal = _a.principal, host = _a.host, operation = _a.operation, addMembership = _a.addMembership, deleteMembership = _a.deleteMembership;
        (0, test_1.test)(testName, function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
            var aclPage;
            var page = _b.page;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        aclPage = new role_page_1.RolePage(page);
                        return [4 /*yield*/, aclPage.goto()];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Set principal and host', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, aclPage.setPrincipal(principal)];
                                        case 1:
                                            _a.sent();
                                            return [4 /*yield*/, aclPage.setHost(host)];
                                        case 2:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Configure all rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, aclPage.configureRules(operation)];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 3:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Submit the form', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, aclPage.submitForm()];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 4:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Wait for navigation to detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, aclPage.waitForDetailPage()];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 5:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Add small delay for stability', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, aclPage.waitForStability(100)];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 6:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Add membership to the role', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(addMembership && addMembership.length > 0)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, aclPage.addMembership(addMembership)];
                                        case 1:
                                            _a.sent();
                                            _a.label = 2;
                                        case 2: return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 7:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Validate member count', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(addMembership && addMembership.length > 0)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, aclPage.validateMemberCount(addMembership.length)];
                                        case 1:
                                            _a.sent();
                                            _a.label = 2;
                                        case 2: return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 8:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Validate each member exists', function () { return __awaiter(void 0, void 0, void 0, function () {
                                var _i, addMembership_1, username;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(addMembership && addMembership.length > 0)) return [3 /*break*/, 4];
                                            _i = 0, addMembership_1 = addMembership;
                                            _a.label = 1;
                                        case 1:
                                            if (!(_i < addMembership_1.length)) return [3 /*break*/, 4];
                                            username = addMembership_1[_i];
                                            return [4 /*yield*/, aclPage.validateMemberExists(username)];
                                        case 2:
                                            _a.sent();
                                            _a.label = 3;
                                        case 3:
                                            _i++;
                                            return [3 /*break*/, 1];
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 9:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Remove membership from the role page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(deleteMembership && deleteMembership.length > 0)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, aclPage.deleteMembership(deleteMembership)];
                                        case 1:
                                            _a.sent();
                                            _a.label = 2;
                                        case 2: return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 10:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Validate member count after deletion', function () { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(deleteMembership && deleteMembership.length > 0)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, aclPage.validateMemberCount(0)];
                                        case 1:
                                            _a.sent();
                                            _a.label = 2;
                                        case 2: return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 11:
                        _c.sent();
                        return [4 /*yield*/, test_1.test.step('Validate each member is removed', function () { return __awaiter(void 0, void 0, void 0, function () {
                                var _i, deleteMembership_1, username;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(deleteMembership && deleteMembership.length > 0)) return [3 /*break*/, 4];
                                            _i = 0, deleteMembership_1 = deleteMembership;
                                            _a.label = 1;
                                        case 1:
                                            if (!(_i < deleteMembership_1.length)) return [3 /*break*/, 4];
                                            username = deleteMembership_1[_i];
                                            return [4 /*yield*/, aclPage.validateMemberNotExists(username)];
                                        case 2:
                                            _a.sent();
                                            _a.label = 3;
                                        case 3:
                                            _i++;
                                            return [3 /*break*/, 1];
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 12:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
test_1.test.describe('Allow all operations', function () {
    [
        {
            testName: 'should set customer operation and then move to all ops allow',
            principal: generatePrincipalName(),
            host: '*',
            operation: [
                {
                    id: 0,
                    resourceType: acl_model_1.ResourceTypeCluster,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: 'kafka-cluster',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeDeny,
                    },
                },
                {
                    id: 1,
                    resourceType: acl_model_1.ResourceTypeTopic,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                        CREATE: acl_model_1.OperationTypeAllow,
                        ALTER: acl_model_1.OperationTypeAllow,
                    },
                },
                {
                    id: 3,
                    resourceType: acl_model_1.ResourceTypeTransactionalId,
                    mode: acl_model_1.ModeCustom,
                    selectorType: acl_model_1.ResourcePatternTypeLiteral,
                    selectorValue: '*',
                    operations: {
                        DESCRIBE: acl_model_1.OperationTypeAllow,
                    },
                },
            ],
        },
    ].map(function (_a) {
        var testName = _a.testName, principal = _a.principal, host = _a.host, operation = _a.operation;
        var allRules = [
            acl_model_1.ResourceTypeCluster,
            acl_model_1.ResourceTypeTopic,
            acl_model_1.ResourceTypeConsumerGroup,
            acl_model_1.ResourceTypeTransactionalId,
            acl_model_1.ResourceTypeSubject,
            acl_model_1.ResourceTypeSchemaRegistry,
        ].map(function (type, i) {
            return ({
                id: i,
                mode: acl_model_1.ModeAllowAll,
                selectorType: acl_model_1.ResourcePatternTypeAny,
                selectorValue: '',
                operations: {},
                resourceType: type,
            });
        });
        aclPages.map(function (_a) {
            var createPage = _a.createPage, type = _a.type;
            (0, test_1.test)("".concat(testName, " - ").concat(type), function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
                var aclPage;
                var page = _b.page;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            aclPage = createPage(page);
                            return [4 /*yield*/, aclPage.goto()];
                        case 1:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Set principal and host', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.setPrincipal(principal)];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, aclPage.setHost(host)];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 2:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Configure all rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.configureRules(operation)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 3:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify the summary shows the correct operations', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllSummaryRules(operation)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 4:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Click the "Allow All" button', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.allowAllButton()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 5:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Validate the summary shows all operations as Allow All', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllSummaryRules(allRules)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 6:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Submit the form', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.submitForm()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 7:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Wait for navigation to detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.waitForDetailPage()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 8:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify ACL Rules count matches', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateRulesCount(allRules.length)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 9:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Add small delay for stability', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.waitForStability(100)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 10:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Check the Detail page - verify all rules are present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateAllDetailRules(allRules, principal, host)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 11:
                            _c.sent();
                            return [4 /*yield*/, test_1.test.step('Verify shared configuration is present', function () { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, aclPage.validateSharedConfig()];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 12:
                            _c.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    });
});
test_1.test.describe('Multiples ACLs, different hosts but same role', function () {
    var firstHost = '*';
    var secondHost = '1.1.1.1';
    var firstACLRules = [
        {
            id: 0,
            resourceType: acl_model_1.ResourceTypeCluster,
            mode: acl_model_1.ModeCustom,
            selectorType: acl_model_1.ResourcePatternTypeLiteral,
            selectorValue: 'kafka-cluster',
            operations: {
                DESCRIBE: acl_model_1.OperationTypeAllow,
                CREATE: acl_model_1.OperationTypeAllow,
                ALTER: acl_model_1.OperationTypeDeny,
                CLUSTER_ACTION: acl_model_1.OperationTypeAllow,
            },
        },
        {
            id: 1,
            resourceType: acl_model_1.ResourceTypeTopic,
            mode: acl_model_1.ModeCustom,
            selectorType: acl_model_1.ResourcePatternTypeLiteral,
            selectorValue: 'events-topic',
            operations: {
                DESCRIBE: acl_model_1.OperationTypeAllow,
                READ: acl_model_1.OperationTypeAllow,
                WRITE: acl_model_1.OperationTypeAllow,
                CREATE: acl_model_1.OperationTypeAllow,
                DELETE: acl_model_1.OperationTypeDeny,
            },
        },
        {
            id: 2,
            resourceType: acl_model_1.ResourceTypeTransactionalId,
            mode: acl_model_1.ModeCustom,
            selectorType: acl_model_1.ResourcePatternTypeLiteral,
            selectorValue: '*',
            operations: {
                DESCRIBE: acl_model_1.OperationTypeAllow,
            },
        },
    ];
    var secondACLRules = [
        {
            id: 0,
            resourceType: acl_model_1.ResourceTypeTopic,
            mode: acl_model_1.ModeCustom,
            selectorType: acl_model_1.ResourcePatternTypeLiteral,
            selectorValue: 'payments-topic',
            operations: {
                DESCRIBE: acl_model_1.OperationTypeAllow,
                READ: acl_model_1.OperationTypeAllow,
                WRITE: acl_model_1.OperationTypeAllow,
            },
        },
        {
            id: 1,
            resourceType: acl_model_1.ResourceTypeTopic,
            mode: acl_model_1.ModeCustom,
            selectorType: acl_model_1.ResourcePatternTypePrefix,
            selectorValue: 'logs-',
            operations: {
                DESCRIBE: acl_model_1.OperationTypeAllow,
                READ: acl_model_1.OperationTypeAllow,
            },
        },
    ];
    var roleName = generatePrincipalName();
    (0, test_1.test)('Create 2 ACLs with same role, 1 with host * and 1 with host 1.1.1.1', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    test_1.test.setTimeout(180000); // 3 minutes timeout for this complex multi-step test
                    return [4 /*yield*/, test_1.test.step('Create first ACL host *', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        return [4 /*yield*/, rolePage.goto()];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Set role name and host', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.setPrincipal(roleName)];
                                                        case 1:
                                                            _a.sent();
                                                            return [4 /*yield*/, rolePage.setHost(firstHost)];
                                                        case 2:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Configure all rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.configureRules(firstACLRules)];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 3:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Verify the summary shows the correct operations', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.validateAllSummaryRules(firstACLRules)];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 4:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Submit the form', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.submitForm()];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 5:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Wait for navigation to detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.waitForDetailPage()];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 6:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Create second ACL host 1.1.1.1', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        return [4 /*yield*/, rolePage.goto()];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Set role name and host', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.setPrincipal(roleName)];
                                                        case 1:
                                                            _a.sent();
                                                            return [4 /*yield*/, rolePage.setHost(secondHost)];
                                                        case 2:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Configure topic rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.configureRules(secondACLRules)];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 3:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Verify the summary shows the correct operations', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.validateAllSummaryRules(secondACLRules)];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 4:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Submit the form', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.submitForm()];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 5:
                                        _a.sent();
                                        return [4 /*yield*/, test_1.test.step('Wait for navigation to detail page', function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, rolePage.waitForDetailPage()];
                                                        case 1:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })];
                                    case 6:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Validate role appears in the list', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage, roleListItem;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        return [4 /*yield*/, rolePage.gotoList()];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, page.getByTestId('search-field-input').fill(roleName)];
                                    case 2:
                                        _a.sent();
                                        roleListItem = page.getByTestId("role-list-item-".concat(roleName));
                                        return [4 /*yield*/, (0, test_1.expect)(roleListItem).toBeVisible({ timeout: 1000 })];
                                    case 3:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Validate SecurityAclRulesTable shows both hosts', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage, firstHostRow, secondHostRow, firstHostCell, secondHostCell, firstHostCount, secondHostCount;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        // Navigate to role detail page without host parameter
                                        return [4 /*yield*/, page.goto("/security/roles/".concat(encodeURIComponent(roleName), "/details"))];
                                    case 1:
                                        // Navigate to role detail page without host parameter
                                        _a.sent();
                                        return [4 /*yield*/, rolePage.waitForDetailPage()];
                                    case 2:
                                        _a.sent();
                                        firstHostRow = page.getByTestId("role-acl-table-row-".concat(firstHost));
                                        return [4 /*yield*/, (0, test_1.expect)(firstHostRow).toBeVisible()];
                                    case 3:
                                        _a.sent();
                                        secondHostRow = page.getByTestId("role-acl-table-row-".concat(secondHost));
                                        return [4 /*yield*/, (0, test_1.expect)(secondHostRow).toBeVisible()];
                                    case 4:
                                        _a.sent();
                                        firstHostCell = page.getByTestId("role-acl-host-".concat(firstHost));
                                        return [4 /*yield*/, (0, test_1.expect)(firstHostCell).toHaveText(firstHost)];
                                    case 5:
                                        _a.sent();
                                        secondHostCell = page.getByTestId("role-acl-host-".concat(secondHost));
                                        return [4 /*yield*/, (0, test_1.expect)(secondHostCell).toHaveText(secondHost)];
                                    case 6:
                                        _a.sent();
                                        firstHostCount = page.getByTestId("role-acl-count-".concat(firstHost));
                                        return [4 /*yield*/, (0, test_1.expect)(firstHostCount).toHaveText(firstACLRules.length.toString())];
                                    case 7:
                                        _a.sent();
                                        secondHostCount = page.getByTestId("role-acl-count-".concat(secondHost));
                                        return [4 /*yield*/, (0, test_1.expect)(secondHostCount).toHaveText(secondACLRules.length.toString())];
                                    case 8:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Click view button for first host and validate rules', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage, viewFirstHostButton;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        viewFirstHostButton = page.getByTestId("view-role-acl-".concat(firstHost));
                                        return [4 /*yield*/, viewFirstHostButton.click()];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, rolePage.waitForDetailPage()];
                                    case 2:
                                        _a.sent();
                                        // Verify URL contains host parameter
                                        return [4 /*yield*/, page.waitForURL(function (url) { return url.href.includes("host=".concat(encodeURIComponent(firstHost))); })];
                                    case 3:
                                        // Verify URL contains host parameter
                                        _a.sent();
                                        // Validate all rules from first ACL are present
                                        return [4 /*yield*/, rolePage.validateAllDetailRules(firstACLRules, "RedpandaRole:".concat(roleName), firstHost)];
                                    case 4:
                                        // Validate all rules from first ACL are present
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Navigate back and click view button for second host', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage, viewSecondHostButton;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        // Navigate back to detail page without host parameter
                                        return [4 /*yield*/, page.goto("/security/roles/".concat(encodeURIComponent(roleName), "/details"))];
                                    case 1:
                                        // Navigate back to detail page without host parameter
                                        _a.sent();
                                        return [4 /*yield*/, rolePage.waitForDetailPage()];
                                    case 2:
                                        _a.sent();
                                        // Verify SecurityAclRulesTable is shown again
                                        return [4 /*yield*/, (0, test_1.expect)(page.getByTestId("role-acl-table-row-".concat(firstHost))).toBeVisible()];
                                    case 3:
                                        // Verify SecurityAclRulesTable is shown again
                                        _a.sent();
                                        viewSecondHostButton = page.getByTestId("view-role-acl-".concat(secondHost));
                                        return [4 /*yield*/, viewSecondHostButton.click()];
                                    case 4:
                                        _a.sent();
                                        return [4 /*yield*/, rolePage.waitForDetailPage()];
                                    case 5:
                                        _a.sent();
                                        // Verify URL contains second host parameter
                                        return [4 /*yield*/, page.waitForURL("**/security/roles/".concat(encodeURIComponent(roleName), "/details?host=").concat(encodeURIComponent(secondHost)))];
                                    case 6:
                                        // Verify URL contains second host parameter
                                        _a.sent();
                                        return [4 /*yield*/, page.waitForURL(function (url) { return url.href.includes("host=".concat(encodeURIComponent(secondHost))); })];
                                    case 7:
                                        _a.sent();
                                        // Validate all rules from second ACL are present
                                        return [4 /*yield*/, rolePage.validateAllDetailRules(secondACLRules, "RedpandaRole:".concat(roleName), secondHost)];
                                    case 8:
                                        // Validate all rules from second ACL are present
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 6:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Navigate to update page without host parameter - verify HostSelector', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var hostSelectorDescription, firstHostRow, secondHostRow;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: 
                                    // Navigate directly to the update page without specifying host
                                    return [4 /*yield*/, page.goto("/security/roles/".concat(encodeURIComponent(roleName), "/update"))];
                                    case 1:
                                        // Navigate directly to the update page without specifying host
                                        _a.sent();
                                        hostSelectorDescription = page.getByTestId('host-selector-description');
                                        return [4 /*yield*/, (0, test_1.expect)(hostSelectorDescription).toBeVisible()];
                                    case 2:
                                        _a.sent();
                                        // Verify the title shows "Multiple hosts found"
                                        return [4 /*yield*/, (0, test_1.expect)(page.getByText('Multiple hosts found')).toBeVisible()];
                                    case 3:
                                        // Verify the title shows "Multiple hosts found"
                                        _a.sent();
                                        firstHostRow = page.getByTestId("host-selector-row-".concat(firstHost));
                                        return [4 /*yield*/, (0, test_1.expect)(firstHostRow).toBeVisible()];
                                    case 4:
                                        _a.sent();
                                        secondHostRow = page.getByTestId("host-selector-row-".concat(secondHost));
                                        return [4 /*yield*/, (0, test_1.expect)(secondHostRow).toBeVisible()];
                                    case 5:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('choose first host from HostSelector and verify navigation', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage, firstHostRow;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        firstHostRow = page.getByTestId("host-selector-row-".concat(firstHost));
                                        return [4 /*yield*/, firstHostRow.click()];
                                    case 1:
                                        _a.sent();
                                        // Verify navigation to update page with host parameter
                                        return [4 /*yield*/, page.waitForURL("**/security/roles/".concat(encodeURIComponent(roleName), "/update?host=").concat(encodeURIComponent(firstHost)))];
                                    case 2:
                                        // Verify navigation to update page with host parameter
                                        _a.sent();
                                        return [4 /*yield*/, page.waitForURL(function (url) { return url.href.includes("host=".concat(encodeURIComponent(firstHost))); })];
                                    case 3:
                                        _a.sent();
                                        // Verify we're on the update page (should show the form)
                                        return [4 /*yield*/, rolePage.waitForUpdatePage()];
                                    case 4:
                                        // Verify we're on the update page (should show the form)
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 8:
                    _c.sent();
                    return [4 /*yield*/, test_1.test.step('Validate updating one ACL does not affect the other', function () { return __awaiter(void 0, void 0, void 0, function () {
                            var rolePage, modifiedFirstACLRules;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        rolePage = new role_page_1.RolePage(page);
                                        // Navigate to first ACL update page
                                        return [4 /*yield*/, page.goto("/security/roles/".concat(encodeURIComponent(roleName), "/update?host=").concat(encodeURIComponent(firstHost)))];
                                    case 1:
                                        // Navigate to first ACL update page
                                        _a.sent();
                                        return [4 /*yield*/, rolePage.waitForUpdatePage()];
                                    case 2:
                                        _a.sent();
                                        modifiedFirstACLRules = [
                                            __assign(__assign({}, firstACLRules[0]), { operations: __assign(__assign({}, firstACLRules[0].operations), { DESCRIBE: acl_model_1.OperationTypeDeny }) }),
                                            firstACLRules[1], // Topic rule unchanged
                                            firstACLRules[2], // TransactionalId rule unchanged
                                        ];
                                        // Apply the update
                                        return [4 /*yield*/, rolePage.updateRules(modifiedFirstACLRules)];
                                    case 3:
                                        // Apply the update
                                        _a.sent();
                                        // Submit the form
                                        return [4 /*yield*/, rolePage.submitForm()];
                                    case 4:
                                        // Submit the form
                                        _a.sent();
                                        // Wait for navigation back to detail page
                                        return [4 /*yield*/, rolePage.waitForDetailPage()];
                                    case 5:
                                        // Wait for navigation back to detail page
                                        _a.sent();
                                        // Verify URL contains the correct host parameter
                                        return [4 /*yield*/, page.waitForURL(function (url) { return url.href.includes("host=".concat(encodeURIComponent(firstHost))); })];
                                    case 6:
                                        // Verify URL contains the correct host parameter
                                        _a.sent();
                                        // Validate the updated rules
                                        return [4 /*yield*/, rolePage.validateAllDetailRules(modifiedFirstACLRules, "RedpandaRole:".concat(roleName), firstHost)];
                                    case 7:
                                        // Validate the updated rules
                                        _a.sent();
                                        // Now verify the second ACL (host 1.1.1.1) was not affected
                                        return [4 /*yield*/, page.goto("/security/roles/".concat(encodeURIComponent(roleName), "/details?host=").concat(encodeURIComponent(secondHost)))];
                                    case 8:
                                        // Now verify the second ACL (host 1.1.1.1) was not affected
                                        _a.sent();
                                        return [4 /*yield*/, rolePage.waitForDetailPage()];
                                    case 9:
                                        _a.sent();
                                        // Verify URL contains the second host parameter
                                        return [4 /*yield*/, page.waitForURL(function (url) { return url.href.includes("host=".concat(encodeURIComponent(secondHost))); })];
                                    case 10:
                                        // Verify URL contains the second host parameter
                                        _a.sent();
                                        // Verify second ACL's rules remain unchanged
                                        return [4 /*yield*/, rolePage.validateAllDetailRules(secondACLRules, "RedpandaRole:".concat(roleName), secondHost)];
                                    case 11:
                                        // Verify second ACL's rules remain unchanged
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 9:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});

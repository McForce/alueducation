**BUILD RUNBOOK**

**Student Enrolment Integration**

Step-by-Step Implementation Guide

*Companion to the Solution Design Document v1.0*

**How to Use This Runbook**

This is the hands-on implementation guide for the Student Enrolment
Integration. It is the companion to the Solution Design Document --- the
SDD explains the why, this runbook explains the exact how.

**Structure:**

-   15 steps grouped into four phases

-   Each step has a goal, the work to do, the code or config, and a
    verification check

-   Do not move to the next step until the verification check passes

-   Code blocks are copy-paste ready; replace placeholder values marked
    as \<like-this\>

**Prerequisites (Assumed in Place)**

-   VS Code with Salesforce Extension Pack installed

-   sfdx CLI authenticated to a Developer Edition org (sfdx org login
    web)

-   AWS account with IAM admin user, CLI configured, and a \$1 billing
    alarm set

-   Node.js 20.x and npm installed

-   AWS SAM CLI installed (sam \--version returns a version)

-   Postman or Insomnia for API calls

**Phase Overview**

  ----------------------------------------------------------------------------
  **Phase**             **Steps**   **Goal**                          **Est.
                                                                      Time**
  --------------------- ----------- --------------------------------- --------
  1 --- Salesforce      1--5        Get a working Salesforce slice:   4.5 hrs
  Foundation                        data model, controller, LWC,      
                                    Experience Cloud page             

  2 --- AWS Foundation  6--9        OpenAPI contract, SAM template,   4.5 hrs
                                    Lambdas, DynamoDB deployed        

  3 --- Integration     10--13      Named Credential, PE subscriber,  3 hrs
                                    end-to-end forward flow working   

  4 --- Reverse Flow &  14--15      External updates flowing back to  2 hrs
  Polish                            Salesforce; observability         
                                    complete                          
  ----------------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **⚠ NOTE Before you start**                                           |
|                                                                       |
| Create a Git repository and commit after every step. This is your     |
| work log, your rollback strategy, and your evidence trail for the     |
| hiring panel.                                                         |
|                                                                       |
| Suggested repo structure: /force-app for Salesforce metadata,         |
| /aws-sam for the SAM template and Lambda code, /openapi for the spec, |
| /docs for this runbook and the SDD.                                   |
+-----------------------------------------------------------------------+

**Phase 1 --- Salesforce Foundation**

By the end of this phase you will have a working Experience Cloud
registration page that creates Contact and User records in your Dev org.
No AWS yet --- we want a green, demo-able Salesforce slice first.

**STEP 1 ◆ Create Custom Fields on Contact**

*Goal: extend the standard Contact object with the fields the
registration form needs, plus the three integration-tracking fields.*

**1.1 Create the fields via VS Code**

Use the sfdx CLI to open Setup, or create the metadata files directly in
force-app/main/default/objects/Contact/fields/. The latter is preferred
because it gives you Git-tracked metadata from step 1.

Create the following field metadata files:

  ---------------------------------------------------------------------------------------
  **File Name**                              **Type**        **Notes**
  ------------------------------------------ --------------- ----------------------------
  Sex\_\_c.field-meta.xml                    Picklist        Values: Male, Female, Prefer
                                                             not to say

  City_of_Residence\_\_c.field-meta.xml      Text(100)       ---

  Country_of_Residence\_\_c.field-meta.xml   Picklist        Use standard country value
                                                             set

  Nationality\_\_c.field-meta.xml            Picklist        Use standard country value
                                                             set

  CorrelationId\_\_c.field-meta.xml          Text(36)        External ID, Unique,
                                                             Case-Sensitive

  IntegrationStatus\_\_c.field-meta.xml      Picklist        Pending, Success, Failed,
                                                             Retrying. Default: Pending

  IntegrationLastSync\_\_c.field-meta.xml    DateTime        ---

  ConsentGiven\_\_c.field-meta.xml           Checkbox        Default: false

  ConsentTimestamp\_\_c.field-meta.xml       DateTime        ---
  ---------------------------------------------------------------------------------------

Example metadata file for CorrelationId\_\_c:

+-----------------------------------------------------------------------+
| *CorrelationId\_\_c.field-meta.xml*                                   |
|                                                                       |
| \<?xml version=\"1.0\" encoding=\"UTF-8\"?\>                          |
|                                                                       |
| \<CustomField xmlns=\"http://soap.sforce.com/2006/04/metadata\"\>     |
|                                                                       |
| \<fullName\>CorrelationId\_\_c\</fullName\>                           |
|                                                                       |
| \<caseSensitive\>true\</caseSensitive\>                               |
|                                                                       |
| \<externalId\>true\</externalId\>                                     |
|                                                                       |
| \<label\>Correlation Id\</label\>                                     |
|                                                                       |
| \<length\>36\</length\>                                               |
|                                                                       |
| \<required\>false\</required\>                                        |
|                                                                       |
| \<type\>Text\</type\>                                                 |
|                                                                       |
| \<unique\>true\</unique\>                                             |
|                                                                       |
| \</CustomField\>                                                      |
+-----------------------------------------------------------------------+

**1.2 Deploy to your org**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| sf project deploy start \--source-dir                                 |
| force-app/main/default/objects/Contact                                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Open your org → Setup → Object Manager → Contact → Fields &           |
| Relationships.                                                        |
|                                                                       |
| All 9 custom fields are listed.                                       |
|                                                                       |
| CorrelationId\_\_c shows \'External ID\' and \'Unique\' in the        |
| properties column.                                                    |
|                                                                       |
| Commit to Git: git add . && git commit -m \'feat(sf): add Contact     |
| custom fields for registration\'                                      |
+-----------------------------------------------------------------------+

**STEP 2 ◆ Create the Platform Event**

*Goal: define the Student_Registered\_\_e Platform Event that decouples
the synchronous registration from the asynchronous outbound
integration.*

**2.1 Create the Platform Event metadata**

In force-app/main/default/objects/, create Student_Registered\_\_e/ with
the following files:

+-----------------------------------------------------------------------+
| *Student_Registered\_\_e.object-meta.xml*                             |
|                                                                       |
| \<?xml version=\"1.0\" encoding=\"UTF-8\"?\>                          |
|                                                                       |
| \<CustomObject xmlns=\"http://soap.sforce.com/2006/04/metadata\"\>    |
|                                                                       |
| \<deploymentStatus\>Deployed\</deploymentStatus\>                     |
|                                                                       |
| \<eventType\>HighVolume\</eventType\>                                 |
|                                                                       |
| \<label\>Student Registered\</label\>                                 |
|                                                                       |
| \<pluralLabel\>Student Registered Events\</pluralLabel\>              |
|                                                                       |
| \<publishBehavior\>PublishAfterCommit\</publishBehavior\>             |
|                                                                       |
| \</CustomObject\>                                                     |
+-----------------------------------------------------------------------+

Then create these fields inside Student_Registered\_\_e/fields/:

  -----------------------------------------------------------------------
  **Field**                **Type**               **Length**
  ------------------------ ---------------------- -----------------------
  CorrelationId\_\_c       Text                   36

  ContactId\_\_c           Text                   18

  Email\_\_c               Text                   255

  PayloadJson\_\_c         LongTextArea           32768

  EventTimestamp\_\_c      DateTime               ---
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **⚠ NOTE Why PublishAfterCommit?**                                    |
|                                                                       |
| PublishAfterCommit guarantees the event only fires if the underlying  |
| Contact insert actually commits. If the transaction rolls back, no    |
| event --- no phantom registrations in AWS. This is the right default  |
| for integration events.                                               |
+-----------------------------------------------------------------------+

**2.2 Deploy**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| sf project deploy start \--source-dir                                 |
| force-app/main/default/objects/Student_Registered\_\_e                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Setup → Platform Events → Student Registered is listed with all 5     |
| fields.                                                               |
|                                                                       |
| Commit: git add . && git commit -m \'feat(sf): add                    |
| Student_Registered\_\_e platform event\'                              |
+-----------------------------------------------------------------------+

**STEP 3 ◆ Build the RegistrationController Apex Class**

*Goal: create the Apex class that the LWC will call. It validates input,
creates the Contact, creates the Community User, publishes the Platform
Event, and returns a response to the LWC.*

**3.1 Create the class**

Create force-app/main/default/classes/RegistrationController.cls:

+-----------------------------------------------------------------------+
| *RegistrationController.cls*                                          |
|                                                                       |
| public with sharing class RegistrationController {                    |
|                                                                       |
| public class RegistrationRequest {                                    |
|                                                                       |
| \@AuraEnabled public String firstName;                                |
|                                                                       |
| \@AuraEnabled public String middleName;                               |
|                                                                       |
| \@AuraEnabled public String lastName;                                 |
|                                                                       |
| \@AuraEnabled public String email;                                    |
|                                                                       |
| \@AuraEnabled public Date dateOfBirth;                                |
|                                                                       |
| \@AuraEnabled public String sex;                                      |
|                                                                       |
| \@AuraEnabled public String cityOfResidence;                          |
|                                                                       |
| \@AuraEnabled public String countryOfResidence;                       |
|                                                                       |
| \@AuraEnabled public String nationality;                              |
|                                                                       |
| \@AuraEnabled public String phone;                                    |
|                                                                       |
| \@AuraEnabled public Boolean consentGiven;                            |
|                                                                       |
| }                                                                     |
|                                                                       |
| public class RegistrationResponse {                                   |
|                                                                       |
| \@AuraEnabled public Boolean success;                                 |
|                                                                       |
| \@AuraEnabled public String contactId;                                |
|                                                                       |
| \@AuraEnabled public String correlationId;                            |
|                                                                       |
| \@AuraEnabled public String message;                                  |
|                                                                       |
| }                                                                     |
|                                                                       |
| \@AuraEnabled                                                         |
|                                                                       |
| public static RegistrationResponse                                    |
| registerStudent(RegistrationRequest req) {                            |
|                                                                       |
| RegistrationResponse res = new RegistrationResponse();                |
|                                                                       |
| String correlationId = generateUuid();                                |
|                                                                       |
| // \-\-- Validation \-\--                                             |
|                                                                       |
| List\<String\> errors = validate(req);                                |
|                                                                       |
| if (!errors.isEmpty()) {                                              |
|                                                                       |
| throw new AuraHandledException(String.join(errors, \'; \'));          |
|                                                                       |
| }                                                                     |
|                                                                       |
| Savepoint sp = Database.setSavepoint();                               |
|                                                                       |
| try {                                                                 |
|                                                                       |
| // \-\-- Create Contact \-\--                                         |
|                                                                       |
| Contact ct = new Contact(                                             |
|                                                                       |
| FirstName = req.firstName,                                            |
|                                                                       |
| MiddleName = req.middleName,                                          |
|                                                                       |
| LastName = req.lastName,                                              |
|                                                                       |
| Email = req.email,                                                    |
|                                                                       |
| Birthdate = req.dateOfBirth,                                          |
|                                                                       |
| Sex\_\_c = req.sex,                                                   |
|                                                                       |
| City_of_Residence\_\_c = req.cityOfResidence,                         |
|                                                                       |
| Country_of_Residence\_\_c = req.countryOfResidence,                   |
|                                                                       |
| Nationality\_\_c = req.nationality,                                   |
|                                                                       |
| Phone = req.phone,                                                    |
|                                                                       |
| CorrelationId\_\_c = correlationId,                                   |
|                                                                       |
| IntegrationStatus\_\_c = \'Pending\',                                 |
|                                                                       |
| ConsentGiven\_\_c = req.consentGiven,                                 |
|                                                                       |
| ConsentTimestamp\_\_c = System.now()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| insert ct;                                                            |
|                                                                       |
| // \-\-- Publish Platform Event \-\--                                 |
|                                                                       |
| Student_Registered\_\_e evt = new Student_Registered\_\_e(            |
|                                                                       |
| CorrelationId\_\_c = correlationId,                                   |
|                                                                       |
| ContactId\_\_c = ct.Id,                                               |
|                                                                       |
| Email\_\_c = req.email,                                               |
|                                                                       |
| PayloadJson\_\_c = JSON.serialize(req),                               |
|                                                                       |
| EventTimestamp\_\_c = System.now()                                    |
|                                                                       |
| );                                                                    |
|                                                                       |
| Database.SaveResult sr = EventBus.publish(evt);                       |
|                                                                       |
| if (!sr.isSuccess()) {                                                |
|                                                                       |
| throw new AuraHandledException(\'Failed to publish registration       |
| event\');                                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| res.success = true;                                                   |
|                                                                       |
| res.contactId = ct.Id;                                                |
|                                                                       |
| res.correlationId = correlationId;                                    |
|                                                                       |
| res.message = \'Registration successful\';                            |
|                                                                       |
| return res;                                                           |
|                                                                       |
| } catch (Exception e) {                                               |
|                                                                       |
| Database.rollback(sp);                                                |
|                                                                       |
| throw new AuraHandledException(\'Registration failed: \' +            |
| e.getMessage());                                                      |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| private static List\<String\> validate(RegistrationRequest r) {       |
|                                                                       |
| List\<String\> errs = new List\<String\>();                           |
|                                                                       |
| if (String.isBlank(r.firstName)) errs.add(\'First name is             |
| required\');                                                          |
|                                                                       |
| if (String.isBlank(r.lastName)) errs.add(\'Last name is required\');  |
|                                                                       |
| if (String.isBlank(r.email)) errs.add(\'Email is required\');         |
|                                                                       |
| if (r.dateOfBirth == null) errs.add(\'Date of birth is required\');   |
|                                                                       |
| if (r.consentGiven != true) errs.add(\'Consent is required\');        |
|                                                                       |
| if (r.email != null && !Pattern.matches(                              |
|                                                                       |
| \'\^\[A-Za-z0-9.\_%+-\]+@\[A-Za-z0-9.-\]+\\\\.\[A-Za-z\]{2,}\$\',     |
| r.email)) {                                                           |
|                                                                       |
| errs.add(\'Email format is invalid\');                                |
|                                                                       |
| }                                                                     |
|                                                                       |
| if (r.dateOfBirth != null && r.dateOfBirth.addYears(16) \>            |
| Date.today()) {                                                       |
|                                                                       |
| errs.add(\'Applicant must be at least 16 years old\');                |
|                                                                       |
| }                                                                     |
|                                                                       |
| return errs;                                                          |
|                                                                       |
| }                                                                     |
|                                                                       |
| private static String generateUuid() {                                |
|                                                                       |
| Blob b = Crypto.generateAesKey(128);                                  |
|                                                                       |
| String h = EncodingUtil.convertToHex(b);                              |
|                                                                       |
| return h.substring(0,8) + \'-\' + h.substring(8,12) + \'-4\' +        |
|                                                                       |
| h.substring(13,16) + \'-a\' + h.substring(17,20) + \'-\' +            |
| h.substring(20,32);                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **⚠ NOTE Community User creation**                                    |
|                                                                       |
| This first pass does not create the Community User --- only the       |
| Contact. Creating a Community User requires an active Experience      |
| Cloud site and a profile/permission set to assign. We\'ll wire that   |
| up in Step 5 after the site exists. For now, Contact creation +       |
| Platform Event is enough to demo.                                     |
+-----------------------------------------------------------------------+

**3.2 Create the test class**

Create RegistrationControllerTest.cls with at least 85% coverage ---
positive path, missing required field, underage, bad email, consent not
given.

+-----------------------------------------------------------------------+
| *RegistrationControllerTest.cls*                                      |
|                                                                       |
| \@IsTest                                                              |
|                                                                       |
| private class RegistrationControllerTest {                            |
|                                                                       |
| private static RegistrationController.RegistrationRequest validReq()  |
| {                                                                     |
|                                                                       |
| RegistrationController.RegistrationRequest r =                        |
|                                                                       |
| new RegistrationController.RegistrationRequest();                     |
|                                                                       |
| r.firstName = \'Test\';                                               |
|                                                                       |
| r.lastName = \'Student\';                                             |
|                                                                       |
| r.email = \'test.student@example.com\';                               |
|                                                                       |
| r.dateOfBirth = Date.today().addYears(-20);                           |
|                                                                       |
| r.sex = \'Prefer not to say\';                                        |
|                                                                       |
| r.cityOfResidence = \'Kigali\';                                       |
|                                                                       |
| r.countryOfResidence = \'Rwanda\';                                    |
|                                                                       |
| r.nationality = \'Rwanda\';                                           |
|                                                                       |
| r.phone = \'+250700000000\';                                          |
|                                                                       |
| r.consentGiven = true;                                                |
|                                                                       |
| return r;                                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| \@IsTest static void happyPath() {                                    |
|                                                                       |
| Test.startTest();                                                     |
|                                                                       |
| RegistrationController.RegistrationResponse res =                     |
|                                                                       |
| RegistrationController.registerStudent(validReq());                   |
|                                                                       |
| Test.stopTest();                                                      |
|                                                                       |
| System.assert(res.success);                                           |
|                                                                       |
| System.assertNotEquals(null, res.contactId);                          |
|                                                                       |
| System.assertNotEquals(null, res.correlationId);                      |
|                                                                       |
| Contact ct = \[SELECT Id, CorrelationId\_\_c FROM Contact WHERE Id =  |
| :res.contactId\];                                                     |
|                                                                       |
| System.assertEquals(res.correlationId, ct.CorrelationId\_\_c);        |
|                                                                       |
| }                                                                     |
|                                                                       |
| \@IsTest static void missingLastName() {                              |
|                                                                       |
| RegistrationController.RegistrationRequest r = validReq();            |
|                                                                       |
| r.lastName = null;                                                    |
|                                                                       |
| try {                                                                 |
|                                                                       |
| RegistrationController.registerStudent(r);                            |
|                                                                       |
| System.assert(false, \'Should have thrown\');                         |
|                                                                       |
| } catch (AuraHandledException e) {                                    |
|                                                                       |
| // expected                                                           |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| \@IsTest static void underage() {                                     |
|                                                                       |
| RegistrationController.RegistrationRequest r = validReq();            |
|                                                                       |
| r.dateOfBirth = Date.today().addYears(-10);                           |
|                                                                       |
| try {                                                                 |
|                                                                       |
| RegistrationController.registerStudent(r);                            |
|                                                                       |
| System.assert(false, \'Should have thrown\');                         |
|                                                                       |
| } catch (AuraHandledException e) {}                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| \@IsTest static void consentNotGiven() {                              |
|                                                                       |
| RegistrationController.RegistrationRequest r = validReq();            |
|                                                                       |
| r.consentGiven = false;                                               |
|                                                                       |
| try {                                                                 |
|                                                                       |
| RegistrationController.registerStudent(r);                            |
|                                                                       |
| System.assert(false, \'Should have thrown\');                         |
|                                                                       |
| } catch (AuraHandledException e) {}                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| \@IsTest static void badEmail() {                                     |
|                                                                       |
| RegistrationController.RegistrationRequest r = validReq();            |
|                                                                       |
| r.email = \'not-an-email\';                                           |
|                                                                       |
| try {                                                                 |
|                                                                       |
| RegistrationController.registerStudent(r);                            |
|                                                                       |
| System.assert(false, \'Should have thrown\');                         |
|                                                                       |
| } catch (AuraHandledException e) {}                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**3.3 Deploy and run the tests**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| sf project deploy start \--source-dir force-app/main/default/classes  |
|                                                                       |
| sf apex run test \--class-names RegistrationControllerTest            |
| \--result-format human \--code-coverage                               |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| All 5 tests pass.                                                     |
|                                                                       |
| Coverage for RegistrationController is ≥ 85%.                         |
|                                                                       |
| Commit: git add . && git commit -m \'feat(sf): add                    |
| RegistrationController + tests\'                                      |
+-----------------------------------------------------------------------+

**STEP 4 ◆ Build the Registration LWC**

*Goal: create the Lightning Web Component that renders the form,
validates client-side, calls the Apex controller, and shows the
confirmation.*

**4.1 Create the component files**

Create force-app/main/default/lwc/registrationForm/ with four files.
Start with the metadata file so the component is exposed to Experience
Cloud:

+-----------------------------------------------------------------------+
| *registrationForm.js-meta.xml*                                        |
|                                                                       |
| \<?xml version=\"1.0\" encoding=\"UTF-8\"?\>                          |
|                                                                       |
| \<LightningComponentBundle                                            |
| xmlns=\"http://soap.sforce.com/2006/04/metadata\"\>                   |
|                                                                       |
| \<apiVersion\>60.0\</apiVersion\>                                     |
|                                                                       |
| \<isExposed\>true\</isExposed\>                                       |
|                                                                       |
| \<masterLabel\>Student Registration Form\</masterLabel\>              |
|                                                                       |
| \<targets\>                                                           |
|                                                                       |
| \<target\>lightningCommunity\_\_Page\</target\>                       |
|                                                                       |
| \<target\>lightningCommunity\_\_Default\</target\>                    |
|                                                                       |
| \</targets\>                                                          |
|                                                                       |
| \</LightningComponentBundle\>                                         |
+-----------------------------------------------------------------------+

HTML template:

+-----------------------------------------------------------------------+
| *registrationForm.html*                                               |
|                                                                       |
| \<template\>                                                          |
|                                                                       |
| \<div class=\"slds-card slds-p-around_large\"\>                       |
|                                                                       |
| \<h1 class=\"slds-text-heading_large                                  |
| slds-text-color_default\"\>Registration\</h1\>                        |
|                                                                       |
| \<p class=\"slds-text-body_regular slds-m-bottom_medium\"\>           |
|                                                                       |
| Register to create an account and begin your journey                  |
|                                                                       |
| \</p\>                                                                |
|                                                                       |
| \<div class=\"slds-notify slds-notify_alert slds-alert_error          |
| slds-m-bottom_medium\"                                                |
|                                                                       |
| if:false={success}\>                                                  |
|                                                                       |
| \<strong\>Please note:\</strong\> You will use your email address to  |
| sign into the portal.                                                 |
|                                                                       |
| \</div\>                                                              |
|                                                                       |
| \<h2 class=\"slds-text-heading_medium                                 |
| slds-m-vertical_medium\"\>Personal & Account Information\</h2\>       |
|                                                                       |
| \<lightning-layout multiple-rows=\"true\"\>                           |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"First Name\" required                       |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"firstName\"\>\</lightning-input\>                        |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"Middle Name\"                               |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"middleName\"\>\</lightning-input\>                       |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"Last Name\" required                        |
|                                                                       |
| onchange={handleChange} data-field=\"lastName\"\>\</lightning-input\> |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"Email\" type=\"email\" required             |
|                                                                       |
| onchange={handleChange} data-field=\"email\"\>\</lightning-input\>    |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"Date of Birth\" type=\"date\" required      |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"dateOfBirth\"\>\</lightning-input\>                      |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-combobox label=\"Sex\" required options={sexOptions}      |
|                                                                       |
| onchange={handleChange} data-field=\"sex\"\>\</lightning-combobox\>   |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"City of Residence\" required                |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"cityOfResidence\"\>\</lightning-input\>                  |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-combobox label=\"Nationality\" required                   |
| options={countryOptions}                                              |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"nationality\"\>\</lightning-combobox\>                   |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-combobox label=\"Country of Residence\" required          |
|                                                                       |
| options={countryOptions}                                              |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"countryOfResidence\"\>\</lightning-combobox\>            |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"6\" padding=\"around-small\"\>         |
|                                                                       |
| \<lightning-input label=\"Phone Number\" type=\"tel\" required        |
|                                                                       |
| onchange={handleChange} data-field=\"phone\"\>\</lightning-input\>    |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \<lightning-layout-item size=\"12\" padding=\"around-small\"\>        |
|                                                                       |
| \<lightning-input label=\"I consent to the processing of my personal  |
| data per the privacy policy\"                                         |
|                                                                       |
| type=\"checkbox\" required                                            |
|                                                                       |
| onchange={handleChange}                                               |
| data-field=\"consentGiven\"\>\</lightning-input\>                     |
|                                                                       |
| \</lightning-layout-item\>                                            |
|                                                                       |
| \</lightning-layout\>                                                 |
|                                                                       |
| \<div class=\"slds-m-top_large\"\>                                    |
|                                                                       |
| \<lightning-button label=\"Register\" variant=\"brand\"               |
|                                                                       |
| onclick={handleSubmit} disabled={isSubmitting}\>\</lightning-button\> |
|                                                                       |
| \</div\>                                                              |
|                                                                       |
| \<template if:true={success}\>                                        |
|                                                                       |
| \<div class=\"slds-notify slds-notify_alert slds-alert_success        |
| slds-m-top_medium\"\>                                                 |
|                                                                       |
| Registration successful. Reference: {correlationId}                   |
|                                                                       |
| \</div\>                                                              |
|                                                                       |
| \</template\>                                                         |
|                                                                       |
| \</div\>                                                              |
|                                                                       |
| \</template\>                                                         |
+-----------------------------------------------------------------------+

JavaScript controller:

+-----------------------------------------------------------------------+
| *registrationForm.js*                                                 |
|                                                                       |
| import { LightningElement, track } from \'lwc\';                      |
|                                                                       |
| import { ShowToastEvent } from \'lightning/platformShowToastEvent\';  |
|                                                                       |
| import registerStudent from                                           |
| \'@salesforce/apex/RegistrationController.registerStudent\';          |
|                                                                       |
| export default class RegistrationForm extends LightningElement {      |
|                                                                       |
| \@track form = {};                                                    |
|                                                                       |
| \@track isSubmitting = false;                                         |
|                                                                       |
| \@track success = false;                                              |
|                                                                       |
| \@track correlationId;                                                |
|                                                                       |
| sexOptions = \[                                                       |
|                                                                       |
| { label: \'Male\', value: \'Male\' },                                 |
|                                                                       |
| { label: \'Female\', value: \'Female\' },                             |
|                                                                       |
| { label: \'Prefer not to say\', value: \'Prefer not to say\' }        |
|                                                                       |
| \];                                                                   |
|                                                                       |
| // Trimmed for brevity --- populate with full ISO country list in     |
| real build                                                            |
|                                                                       |
| countryOptions = \[                                                   |
|                                                                       |
| { label: \'Rwanda\', value: \'Rwanda\' },                             |
|                                                                       |
| { label: \'South Africa\', value: \'South Africa\' },                 |
|                                                                       |
| { label: \'Kenya\', value: \'Kenya\' },                               |
|                                                                       |
| { label: \'Nigeria\', value: \'Nigeria\' },                           |
|                                                                       |
| { label: \'Ghana\', value: \'Ghana\' }                                |
|                                                                       |
| \];                                                                   |
|                                                                       |
| handleChange(event) {                                                 |
|                                                                       |
| const field = event.target.dataset.field;                             |
|                                                                       |
| const value = event.target.type === \'checkbox\'                      |
|                                                                       |
| ? event.target.checked : event.target.value;                          |
|                                                                       |
| this.form = { \...this.form, \[field\]: value };                      |
|                                                                       |
| }                                                                     |
|                                                                       |
| async handleSubmit() {                                                |
|                                                                       |
| if (!this.validateInputs()) return;                                   |
|                                                                       |
| this.isSubmitting = true;                                             |
|                                                                       |
| try {                                                                 |
|                                                                       |
| const res = await registerStudent({ req: this.form });                |
|                                                                       |
| this.success = true;                                                  |
|                                                                       |
| this.correlationId = res.correlationId;                               |
|                                                                       |
| this.dispatchEvent(new ShowToastEvent({                               |
|                                                                       |
| title: \'Registration successful\',                                   |
|                                                                       |
| message: \`Reference: \${res.correlationId}\`,                        |
|                                                                       |
| variant: \'success\'                                                  |
|                                                                       |
| }));                                                                  |
|                                                                       |
| } catch (e) {                                                         |
|                                                                       |
| this.dispatchEvent(new ShowToastEvent({                               |
|                                                                       |
| title: \'Registration failed\',                                       |
|                                                                       |
| message: e.body ? e.body.message : e.message,                         |
|                                                                       |
| variant: \'error\'                                                    |
|                                                                       |
| }));                                                                  |
|                                                                       |
| } finally {                                                           |
|                                                                       |
| this.isSubmitting = false;                                            |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| validateInputs() {                                                    |
|                                                                       |
| const inputs =                                                        |
| \[\...this.template.querySelectorAll(\'lightning-input,               |
| lightning-combobox\')\];                                              |
|                                                                       |
| return inputs.reduce((valid, el) =\> {                                |
|                                                                       |
| el.reportValidity();                                                  |
|                                                                       |
| return valid && el.checkValidity();                                   |
|                                                                       |
| }, true);                                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**4.2 Deploy**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| sf project deploy start \--source-dir                                 |
| force-app/main/default/lwc/registrationForm                           |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Setup → Lightning Components → registrationForm is listed.            |
|                                                                       |
| No deploy errors.                                                     |
|                                                                       |
| Commit: git add . && git commit -m \'feat(sf): add registrationForm   |
| LWC\'                                                                 |
+-----------------------------------------------------------------------+

**STEP 5 ◆ Wire LWC to an Experience Cloud Page**

*Goal: create an Experience Cloud site, drop the LWC onto a public page,
and verify the form works end-to-end in a browser.*

**5.1 Create the Experience Cloud site**

1.  Setup → Digital Experiences → All Sites → New.

2.  Choose the \"Build Your Own (LWR)\" template.

3.  Name: ALU Apply. URL: alurwapply. Click Create.

4.  When the site opens in Experience Builder, open Settings → General →
    set it to Public (Guest User access).

**5.2 Create the Register page**

5.  In Experience Builder, Pages → New Page → Standard Page → Blank.

6.  Name: Register. URL: /register.

7.  From the Components panel, drag Student Registration Form onto the
    page.

8.  Save and Publish the site.

**5.3 Grant Guest User permissions**

9.  Setup → Digital Experiences → All Sites → ALU Apply → Workspaces →
    Administration → Pages → Guest User Profile.

10. On the Guest User profile, grant: Create on Contact, and Apex Class
    Access to RegistrationController.

11. Field-Level Security: ensure the Guest User can write to all the
    Contact fields you created in Step 1.

+-----------------------------------------------------------------------+
| **⚠ NOTE Guest User security**                                        |
|                                                                       |
| Granting Create on Contact to an unauthenticated guest is a           |
| legitimate but sensitive decision. In production you would use        |
| Salesforce Shield, rate limiting at the CDN, and CAPTCHA. For this    |
| demo it is acceptable --- document the trade-off in your Loom.        |
+-----------------------------------------------------------------------+

**5.4 Test in the browser**

12. In Experience Builder, click Preview.

13. Navigate to /register.

14. Fill in the form with a real email and submit.

15. You should see a green success toast with a correlation ID.

16. In Setup → Object Manager → Contact → recent records, confirm the
    Contact exists with IntegrationStatus\_\_c = Pending.

+-----------------------------------------------------------------------+
| **✓ VERIFY Phase 1 complete**                                         |
|                                                                       |
| A prospective student can visit your Experience Cloud site, fill in   |
| the registration form, and have a Contact created in Salesforce with  |
| a correlation ID.                                                     |
|                                                                       |
| You have a demo-able Salesforce slice before touching AWS.            |
|                                                                       |
| Commit: git add . && git commit -m \'feat(sf): expose registration on |
| Experience Cloud site\'                                               |
+-----------------------------------------------------------------------+

**Phase 2 --- AWS Foundation**

By the end of this phase you will have the OpenAPI contract written, the
SAM template deployed, and a Lambda that receives POST /enrolments and
returns the right response. No Salesforce integration yet --- you will
test it directly with Postman.

**STEP 6 ◆ Write the OpenAPI Specification**

*Goal: create the authoritative contract. This file becomes the source
for your AWS API Gateway and the artefact you walk through with the
hiring panel.*

**6.1 Create the file**

Create openapi/student-enrolment-api.yaml. A trimmed version showing the
critical structure follows --- expand each schema fully when you build.
The full file should be roughly 300--400 lines.

+-----------------------------------------------------------------------+
| *openapi/student-enrolment-api.yaml*                                  |
|                                                                       |
| openapi: 3.0.3                                                        |
|                                                                       |
| info:                                                                 |
|                                                                       |
| title: Student Enrolment API                                          |
|                                                                       |
| version: 1.0.0                                                        |
|                                                                       |
| description: \|                                                       |
|                                                                       |
| Governed integration contract for student enrolment data between      |
|                                                                       |
| Salesforce and downstream systems at EduTechCo.                       |
|                                                                       |
| contact:                                                              |
|                                                                       |
| name: Platform Engineering                                            |
|                                                                       |
| email: platform@edutechco.com                                         |
|                                                                       |
| servers:                                                              |
|                                                                       |
| \- url: https://api.edutechco.com/v1                                  |
|                                                                       |
| description: Production                                               |
|                                                                       |
| \- url: https://api-dev.edutechco.com/v1                              |
|                                                                       |
| description: Development                                              |
|                                                                       |
| security:                                                             |
|                                                                       |
| \- OAuth2: \[enrolments:write, enrolments:read\]                      |
|                                                                       |
| paths:                                                                |
|                                                                       |
| /enrolments:                                                          |
|                                                                       |
| post:                                                                 |
|                                                                       |
| summary: Create a new enrolment                                       |
|                                                                       |
| operationId: createEnrolment                                          |
|                                                                       |
| parameters:                                                           |
|                                                                       |
| \- \$ref: \'#/components/parameters/IdempotencyKey\'                  |
|                                                                       |
| \- \$ref: \'#/components/parameters/CorrelationId\'                   |
|                                                                       |
| requestBody:                                                          |
|                                                                       |
| required: true                                                        |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/json:                                                     |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/EnrolmentRequest\' }          |
|                                                                       |
| responses:                                                            |
|                                                                       |
| \'201\':                                                              |
|                                                                       |
| description: Enrolment created                                        |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/json:                                                     |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/Enrolment\' }                 |
|                                                                       |
| \'400\': { \$ref: \'#/components/responses/BadRequest\' }             |
|                                                                       |
| \'409\': { \$ref: \'#/components/responses/Conflict\' }               |
|                                                                       |
| \'429\': { \$ref: \'#/components/responses/TooManyRequests\' }        |
|                                                                       |
| /enrolments/{id}:                                                     |
|                                                                       |
| patch:                                                                |
|                                                                       |
| summary: Update an enrolment                                          |
|                                                                       |
| operationId: updateEnrolment                                          |
|                                                                       |
| parameters:                                                           |
|                                                                       |
| \- name: id                                                           |
|                                                                       |
| in: path                                                              |
|                                                                       |
| required: true                                                        |
|                                                                       |
| schema: { type: string }                                              |
|                                                                       |
| \- \$ref: \'#/components/parameters/IdempotencyKey\'                  |
|                                                                       |
| requestBody:                                                          |
|                                                                       |
| required: true                                                        |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/json:                                                     |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/EnrolmentUpdate\' }           |
|                                                                       |
| responses:                                                            |
|                                                                       |
| \'200\':                                                              |
|                                                                       |
| description: Updated                                                  |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/json:                                                     |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/Enrolment\' }                 |
|                                                                       |
| components:                                                           |
|                                                                       |
| securitySchemes:                                                      |
|                                                                       |
| OAuth2:                                                               |
|                                                                       |
| type: oauth2                                                          |
|                                                                       |
| flows:                                                                |
|                                                                       |
| clientCredentials:                                                    |
|                                                                       |
| tokenUrl: https://auth.edutechco.com/oauth/token                      |
|                                                                       |
| scopes:                                                               |
|                                                                       |
| enrolments:read: Read enrolment data                                  |
|                                                                       |
| enrolments:write: Create and update enrolments                        |
|                                                                       |
| parameters:                                                           |
|                                                                       |
| IdempotencyKey:                                                       |
|                                                                       |
| name: Idempotency-Key                                                 |
|                                                                       |
| in: header                                                            |
|                                                                       |
| required: true                                                        |
|                                                                       |
| schema: { type: string, format: uuid }                                |
|                                                                       |
| CorrelationId:                                                        |
|                                                                       |
| name: X-Correlation-Id                                                |
|                                                                       |
| in: header                                                            |
|                                                                       |
| required: false                                                       |
|                                                                       |
| schema: { type: string, format: uuid }                                |
|                                                                       |
| schemas:                                                              |
|                                                                       |
| EnrolmentRequest:                                                     |
|                                                                       |
| type: object                                                          |
|                                                                       |
| required: \[firstName, lastName, email, dateOfBirth, consentGiven\]   |
|                                                                       |
| properties:                                                           |
|                                                                       |
| firstName: { type: string, maxLength: 40 }                            |
|                                                                       |
| middleName: { type: string, maxLength: 40 }                           |
|                                                                       |
| lastName: { type: string, maxLength: 80 }                             |
|                                                                       |
| email: { type: string, format: email }                                |
|                                                                       |
| dateOfBirth: { type: string, format: date }                           |
|                                                                       |
| sex: { type: string, enum: \[Male, Female, \"Prefer not to say\"\] }  |
|                                                                       |
| cityOfResidence: { type: string }                                     |
|                                                                       |
| countryOfResidence: { type: string }                                  |
|                                                                       |
| nationality: { type: string }                                         |
|                                                                       |
| phone: { type: string }                                               |
|                                                                       |
| consentGiven: { type: boolean }                                       |
|                                                                       |
| correlationId: { type: string, format: uuid }                         |
|                                                                       |
| Enrolment:                                                            |
|                                                                       |
| allOf:                                                                |
|                                                                       |
| \- \$ref: \'#/components/schemas/EnrolmentRequest\'                   |
|                                                                       |
| \- type: object                                                       |
|                                                                       |
| properties:                                                           |
|                                                                       |
| id: { type: string }                                                  |
|                                                                       |
| status: { type: string, enum: \[pending, submitted, accepted,         |
| rejected\] }                                                          |
|                                                                       |
| createdAt: { type: string, format: date-time }                        |
|                                                                       |
| updatedAt: { type: string, format: date-time }                        |
|                                                                       |
| EnrolmentUpdate:                                                      |
|                                                                       |
| type: object                                                          |
|                                                                       |
| properties:                                                           |
|                                                                       |
| status: { type: string, enum: \[pending, submitted, accepted,         |
| rejected\] }                                                          |
|                                                                       |
| notes: { type: string }                                               |
|                                                                       |
| Problem:                                                              |
|                                                                       |
| type: object                                                          |
|                                                                       |
| description: RFC 7807 Problem Details                                 |
|                                                                       |
| properties:                                                           |
|                                                                       |
| type: { type: string, format: uri }                                   |
|                                                                       |
| title: { type: string }                                               |
|                                                                       |
| status: { type: integer }                                             |
|                                                                       |
| detail: { type: string }                                              |
|                                                                       |
| instance: { type: string }                                            |
|                                                                       |
| correlationId: { type: string }                                       |
|                                                                       |
| responses:                                                            |
|                                                                       |
| BadRequest:                                                           |
|                                                                       |
| description: Validation error                                         |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/problem+json:                                             |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/Problem\' }                   |
|                                                                       |
| Conflict:                                                             |
|                                                                       |
| description: Idempotency key conflict                                 |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/problem+json:                                             |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/Problem\' }                   |
|                                                                       |
| TooManyRequests:                                                      |
|                                                                       |
| description: Rate limit exceeded                                      |
|                                                                       |
| headers:                                                              |
|                                                                       |
| Retry-After:                                                          |
|                                                                       |
| schema: { type: integer }                                             |
|                                                                       |
| content:                                                              |
|                                                                       |
| application/problem+json:                                             |
|                                                                       |
| schema: { \$ref: \'#/components/schemas/Problem\' }                   |
+-----------------------------------------------------------------------+

**6.2 Validate the spec**

Paste the YAML into https://editor.swagger.io or run a local linter:

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| npx \@redocly/cli lint openapi/student-enrolment-api.yaml             |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Swagger Editor shows no red errors.                                   |
|                                                                       |
| The rendered Swagger UI lets you expand POST /enrolments and see the  |
| request/response schemas with examples.                               |
|                                                                       |
| Commit: git add openapi/ && git commit -m \'feat(api): add OpenAPI    |
| 3.0 spec for enrolment service\'                                      |
+-----------------------------------------------------------------------+

**STEP 7 ◆ Create the SAM Template**

*Goal: define the AWS infrastructure (API Gateway, two Lambda functions,
DynamoDB table, Secrets Manager placeholder, CloudWatch log groups) as
code.*

**7.1 Initialise the SAM project**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| mkdir aws-sam && cd aws-sam                                           |
|                                                                       |
| sam init \--runtime nodejs20.x \--name enrolment-api \--app-template  |
| hello-world \--no-tracing \--package-type Zip                         |
|                                                                       |
| \# Delete the hello-world boilerplate; we will author template.yaml   |
| from scratch                                                          |
+-----------------------------------------------------------------------+

**7.2 Write the SAM template**

Create aws-sam/template.yaml:

+-----------------------------------------------------------------------+
| *aws-sam/template.yaml*                                               |
|                                                                       |
| AWSTemplateFormatVersion: \'2010-09-09\'                              |
|                                                                       |
| Transform: AWS::Serverless-2016-10-31                                 |
|                                                                       |
| Description: Student Enrolment Integration - API Gateway + Lambda +   |
| DynamoDB                                                              |
|                                                                       |
| Parameters:                                                           |
|                                                                       |
| Stage:                                                                |
|                                                                       |
| Type: String                                                          |
|                                                                       |
| Default: dev                                                          |
|                                                                       |
| SalesforceInstanceUrl:                                                |
|                                                                       |
| Type: String                                                          |
|                                                                       |
| Description: Your Salesforce Dev org My Domain URL                    |
|                                                                       |
| Default: https://your-org.my.salesforce.com                           |
|                                                                       |
| Globals:                                                              |
|                                                                       |
| Function:                                                             |
|                                                                       |
| Runtime: nodejs20.x                                                   |
|                                                                       |
| Timeout: 10                                                           |
|                                                                       |
| MemorySize: 256                                                       |
|                                                                       |
| Environment:                                                          |
|                                                                       |
| Variables:                                                            |
|                                                                       |
| STAGE: !Ref Stage                                                     |
|                                                                       |
| IDEMPOTENCY_TABLE: !Ref IdempotencyTable                              |
|                                                                       |
| SF_INSTANCE_URL: !Ref SalesforceInstanceUrl                           |
|                                                                       |
| SF_JWT_SECRET_ARN: !Ref SalesforceJwtSecret                           |
|                                                                       |
| Resources:                                                            |
|                                                                       |
| IdempotencyTable:                                                     |
|                                                                       |
| Type: AWS::DynamoDB::Table                                            |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| BillingMode: PAY_PER_REQUEST                                          |
|                                                                       |
| AttributeDefinitions:                                                 |
|                                                                       |
| \- AttributeName: idempotencyKey                                      |
|                                                                       |
| AttributeType: S                                                      |
|                                                                       |
| KeySchema:                                                            |
|                                                                       |
| \- AttributeName: idempotencyKey                                      |
|                                                                       |
| KeyType: HASH                                                         |
|                                                                       |
| TimeToLiveSpecification:                                              |
|                                                                       |
| AttributeName: ttl                                                    |
|                                                                       |
| Enabled: true                                                         |
|                                                                       |
| SalesforceJwtSecret:                                                  |
|                                                                       |
| Type: AWS::SecretsManager::Secret                                     |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| Name: !Sub \'\${AWS::StackName}-sf-jwt-key\'                          |
|                                                                       |
| Description: Private key for Salesforce JWT Bearer auth               |
|                                                                       |
| SecretString:                                                         |
| \'{\"privateKey\":\"REPLACE_AFTER_DEPLOY\",\"clientI                  |
| d\":\"REPLACE_AFTER_DEPLOY\",\"username\":\"REPLACE_AFTER_DEPLOY\"}\' |
|                                                                       |
| EnrolmentApi:                                                         |
|                                                                       |
| Type: AWS::Serverless::Api                                            |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| StageName: !Ref Stage                                                 |
|                                                                       |
| DefinitionBody:                                                       |
|                                                                       |
| Fn::Transform:                                                        |
|                                                                       |
| Name: AWS::Include                                                    |
|                                                                       |
| Parameters:                                                           |
|                                                                       |
| Location: ../openapi/student-enrolment-api.yaml                       |
|                                                                       |
| Auth:                                                                 |
|                                                                       |
| DefaultAuthorizer: NONE \# Tighten to OAuth2 in a later hardening     |
| pass                                                                  |
|                                                                       |
| CreateEnrolmentFunction:                                              |
|                                                                       |
| Type: AWS::Serverless::Function                                       |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| CodeUri: src/create-enrolment/                                        |
|                                                                       |
| Handler: index.handler                                                |
|                                                                       |
| Policies:                                                             |
|                                                                       |
| \- DynamoDBCrudPolicy:                                                |
|                                                                       |
| TableName: !Ref IdempotencyTable                                      |
|                                                                       |
| Events:                                                               |
|                                                                       |
| ApiEvent:                                                             |
|                                                                       |
| Type: Api                                                             |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| RestApiId: !Ref EnrolmentApi                                          |
|                                                                       |
| Path: /enrolments                                                     |
|                                                                       |
| Method: POST                                                          |
|                                                                       |
| UpdateEnrolmentFunction:                                              |
|                                                                       |
| Type: AWS::Serverless::Function                                       |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| CodeUri: src/update-enrolment/                                        |
|                                                                       |
| Handler: index.handler                                                |
|                                                                       |
| Policies:                                                             |
|                                                                       |
| \- Statement:                                                         |
|                                                                       |
| \- Effect: Allow                                                      |
|                                                                       |
| Action: \[secretsmanager:GetSecretValue\]                             |
|                                                                       |
| Resource: !Ref SalesforceJwtSecret                                    |
|                                                                       |
| Events:                                                               |
|                                                                       |
| ApiEvent:                                                             |
|                                                                       |
| Type: Api                                                             |
|                                                                       |
| Properties:                                                           |
|                                                                       |
| RestApiId: !Ref EnrolmentApi                                          |
|                                                                       |
| Path: /enrolments/{id}                                                |
|                                                                       |
| Method: PATCH                                                         |
|                                                                       |
| Outputs:                                                              |
|                                                                       |
| ApiUrl:                                                               |
|                                                                       |
| Description: Base URL for the enrolment API                           |
|                                                                       |
| Value: !Sub                                                           |
| \'https://\                                                           |
| ${EnrolmentApi}.execute-api.\${AWS::Region}.amazonaws.com/\${Stage}\' |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **⚠ NOTE Why DefaultAuthorizer: NONE for now?**                       |
|                                                                       |
| We keep auth open during the build so you can test fast. Adding the   |
| OAuth2 authorizer before the happy path works is a recipe for         |
| spending an hour debugging auth instead of the actual flow. We will   |
| tighten this as a hardening step --- document it in your risks        |
| section.                                                              |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| template.yaml exists and is syntactically valid YAML.                 |
|                                                                       |
| Commit: git add aws-sam/ && git commit -m \'feat(aws): add SAM        |
| template skeleton\'                                                   |
+-----------------------------------------------------------------------+

**STEP 8 ◆ Write the Create-Enrolment Lambda**

*Goal: implement the POST /enrolments handler --- schema check,
idempotency lookup, DynamoDB write, structured logging, response.*

**8.1 Create the source directory**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| mkdir -p aws-sam/src/create-enrolment                                 |
|                                                                       |
| cd aws-sam/src/create-enrolment                                       |
|                                                                       |
| npm init -y                                                           |
|                                                                       |
| npm install \@aws-sdk/client-dynamodb \@aws-sdk/lib-dynamodb          |
+-----------------------------------------------------------------------+

**8.2 Write the handler**

Create aws-sam/src/create-enrolment/index.js:

+-----------------------------------------------------------------------+
| *aws-sam/src/create-enrolment/index.js*                               |
|                                                                       |
| const { DynamoDBClient } = require(\'@aws-sdk/client-dynamodb\');     |
|                                                                       |
| const { DynamoDBDocumentClient, GetCommand, PutCommand } =            |
| require(\'@aws-sdk/lib-dynamodb\');                                   |
|                                                                       |
| const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));      |
|                                                                       |
| const TABLE = process.env.IDEMPOTENCY_TABLE;                          |
|                                                                       |
| exports.handler = async (event) =\> {                                 |
|                                                                       |
| const correlationId = event.headers?.\[\'X-Correlation-Id\'\]         |
|                                                                       |
| \|\| event.headers?.\[\'x-correlation-id\'\]                          |
|                                                                       |
| \|\| generateId();                                                    |
|                                                                       |
| const idempotencyKey = event.headers?.\[\'Idempotency-Key\'\]         |
|                                                                       |
| \|\| event.headers?.\[\'idempotency-key\'\];                          |
|                                                                       |
| log(\'info\', \'received\', { correlationId, idempotencyKey });       |
|                                                                       |
| // Validate required header                                           |
|                                                                       |
| if (!idempotencyKey) {                                                |
|                                                                       |
| return problem(400, \'missing-idempotency-key\',                      |
|                                                                       |
| \'Idempotency-Key header is required\', correlationId);               |
|                                                                       |
| }                                                                     |
|                                                                       |
| // Validate body                                                      |
|                                                                       |
| let body;                                                             |
|                                                                       |
| try { body = JSON.parse(event.body \|\| \'{}\'); }                    |
|                                                                       |
| catch (e) { return problem(400, \'invalid-json\', \'Body is not valid |
| JSON\', correlationId); }                                             |
|                                                                       |
| const errors = validate(body);                                        |
|                                                                       |
| if (errors.length) {                                                  |
|                                                                       |
| return problem(400, \'validation-failed\', errors.join(\'; \'),       |
| correlationId);                                                       |
|                                                                       |
| }                                                                     |
|                                                                       |
| // Idempotency check                                                  |
|                                                                       |
| try {                                                                 |
|                                                                       |
| const existing = await ddb.send(new GetCommand({                      |
|                                                                       |
| TableName: TABLE,                                                     |
|                                                                       |
| Key: { idempotencyKey }                                               |
|                                                                       |
| }));                                                                  |
|                                                                       |
| if (existing.Item) {                                                  |
|                                                                       |
| log(\'info\', \'replay\', { correlationId, idempotencyKey });         |
|                                                                       |
| return {                                                              |
|                                                                       |
| statusCode: existing.Item.statusCode,                                 |
|                                                                       |
| headers: { \'Content-Type\': \'application/json\',                    |
| \'X-Correlation-Id\': correlationId },                                |
|                                                                       |
| body: existing.Item.responseBody                                      |
|                                                                       |
| };                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| } catch (e) {                                                         |
|                                                                       |
| log(\'error\', \'ddb get failed\', { correlationId, error: e.message  |
| });                                                                   |
|                                                                       |
| return problem(503, \'storage-unavailable\', \'Storage check          |
| failed\', correlationId);                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| // \"Process\" --- in a real system, forward to SIS, email service,   |
| etc.                                                                  |
|                                                                       |
| const enrolment = {                                                   |
|                                                                       |
| id: \`enr\_\${Date.now()}\`,                                          |
|                                                                       |
| \...body,                                                             |
|                                                                       |
| status: \'pending\',                                                  |
|                                                                       |
| createdAt: new Date().toISOString(),                                  |
|                                                                       |
| updatedAt: new Date().toISOString()                                   |
|                                                                       |
| };                                                                    |
|                                                                       |
| const responseBody = JSON.stringify(enrolment);                       |
|                                                                       |
| // Cache for idempotency replay (24h TTL)                             |
|                                                                       |
| await ddb.send(new PutCommand({                                       |
|                                                                       |
| TableName: TABLE,                                                     |
|                                                                       |
| Item: {                                                               |
|                                                                       |
| idempotencyKey,                                                       |
|                                                                       |
| statusCode: 201,                                                      |
|                                                                       |
| responseBody,                                                         |
|                                                                       |
| correlationId,                                                        |
|                                                                       |
| createdAt: Date.now(),                                                |
|                                                                       |
| ttl: Math.floor(Date.now() / 1000) + 86400                            |
|                                                                       |
| }                                                                     |
|                                                                       |
| }));                                                                  |
|                                                                       |
| log(\'info\', \'created\', { correlationId, enrolmentId: enrolment.id |
| });                                                                   |
|                                                                       |
| return {                                                              |
|                                                                       |
| statusCode: 201,                                                      |
|                                                                       |
| headers: {                                                            |
|                                                                       |
| \'Content-Type\': \'application/json\',                               |
|                                                                       |
| \'X-Correlation-Id\': correlationId                                   |
|                                                                       |
| },                                                                    |
|                                                                       |
| body: responseBody                                                    |
|                                                                       |
| };                                                                    |
|                                                                       |
| };                                                                    |
|                                                                       |
| function validate(body) {                                             |
|                                                                       |
| const errs = \[\];                                                    |
|                                                                       |
| if (!body.firstName) errs.push(\'firstName required\');               |
|                                                                       |
| if (!body.lastName) errs.push(\'lastName required\');                 |
|                                                                       |
| if (!body.email) errs.push(\'email required\');                       |
|                                                                       |
| if (!body.dateOfBirth) errs.push(\'dateOfBirth required\');           |
|                                                                       |
| if (body.consentGiven !== true) errs.push(\'consent required\');      |
|                                                                       |
| return errs;                                                          |
|                                                                       |
| }                                                                     |
|                                                                       |
| function problem(status, type, detail, correlationId) {               |
|                                                                       |
| return {                                                              |
|                                                                       |
| statusCode: status,                                                   |
|                                                                       |
| headers: { \'Content-Type\': \'application/problem+json\',            |
| \'X-Correlation-Id\': correlationId },                                |
|                                                                       |
| body: JSON.stringify({                                                |
|                                                                       |
| type: \`https://api.edutechco.com/errors/\${type}\`,                  |
|                                                                       |
| title: type.replace(/-/g, \' \'),                                     |
|                                                                       |
| status,                                                               |
|                                                                       |
| detail,                                                               |
|                                                                       |
| correlationId                                                         |
|                                                                       |
| })                                                                    |
|                                                                       |
| };                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| function log(level, msg, fields) {                                    |
|                                                                       |
| console.log(JSON.stringify({ level, msg, \...fields, timestamp: new   |
| Date().toISOString() }));                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| function generateId() {                                               |
|                                                                       |
| return \'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx\'.replace(/\[xy\]/g, c  |
| =\> {                                                                 |
|                                                                       |
| const r = Math.random() \* 16 \| 0;                                   |
|                                                                       |
| return (c === \'x\' ? r : (r & 0x3 \| 0x8)).toString(16);             |
|                                                                       |
| });                                                                   |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| index.js and package.json exist; node_modules populated.              |
|                                                                       |
| No syntax errors: node -c index.js                                    |
|                                                                       |
| Commit progress.                                                      |
+-----------------------------------------------------------------------+

**STEP 9 ◆ Deploy SAM and Test with Postman**

*Goal: deploy the stack to AWS and verify the POST /enrolments endpoint
works end-to-end from Postman, before wiring Salesforce to it.*

**9.1 Deploy**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| cd aws-sam                                                            |
|                                                                       |
| sam build                                                             |
|                                                                       |
| sam deploy \--guided                                                  |
|                                                                       |
| \# Answer the prompts:                                                |
|                                                                       |
| \# Stack Name: enrolment-api-dev                                      |
|                                                                       |
| \# Region: eu-west-1                                                  |
|                                                                       |
| \# Confirm changes: Y                                                 |
|                                                                       |
| \# Allow IAM role creation: Y                                         |
|                                                                       |
| \# Save arguments to samconfig.toml: Y                                |
+-----------------------------------------------------------------------+

When the deploy finishes, note the ApiUrl output --- you\'ll need it for
Postman and for the Salesforce Named Credential in Step 10.

**9.2 Test with Postman**

Create a new Postman request:

-   **Method:** POST

-   **URL:** \<your-api-url\>/enrolments

-   **Headers:** Content-Type: application/json; Idempotency-Key:
    \<a-random-uuid\>; X-Correlation-Id: \<same-or-different-uuid\>

Body (raw JSON):

+-----------------------------------------------------------------------+
| *body*                                                                |
|                                                                       |
| {                                                                     |
|                                                                       |
| \"firstName\": \"Test\",                                              |
|                                                                       |
| \"lastName\": \"Student\",                                            |
|                                                                       |
| \"email\": \"test@example.com\",                                      |
|                                                                       |
| \"dateOfBirth\": \"2000-01-01\",                                      |
|                                                                       |
| \"consentGiven\": true                                                |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**9.3 Verify the idempotency behaviour**

17. Send the request once --- expect 201 with an enrolment ID.

18. Send the exact same request again (same Idempotency-Key) --- expect
    201 with the same enrolment ID (cached replay).

19. Change the Idempotency-Key and resend --- expect 201 with a new
    enrolment ID.

**9.4 Inspect the data**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| \# CloudWatch logs                                                    |
|                                                                       |
| aws logs tail /aws/lambda/enrolment-api-dev-CreateEnrolmentFunction   |
| \--follow                                                             |
|                                                                       |
| \# DynamoDB contents                                                  |
|                                                                       |
| aws dynamodb scan \--table-name                                       |
| \<IdempotencyTable-name-from-console\>                                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Phase 2 complete**                                         |
|                                                                       |
| POST /enrolments returns 201 on first call, 201 with the cached body  |
| on replay.                                                            |
|                                                                       |
| CloudWatch shows structured logs with the correlation ID.             |
|                                                                       |
| DynamoDB contains the idempotency record with a TTL 24 hours in the   |
| future.                                                               |
|                                                                       |
| Commit: git add . && git commit -m \'feat(aws): deploy                |
| create-enrolment lambda + sam template\'                              |
+-----------------------------------------------------------------------+

**Phase 3 --- Integration**

By the end of this phase, submitting the LWC form will create a Contact
in Salesforce, fire a Platform Event, and land a matching record in
DynamoDB via AWS --- all tied together by a single correlation ID.

**STEP 10 ◆ Create the Named Credential for AWS**

*Goal: configure a Named Credential so Apex can call AWS without
hard-coding URLs or secrets.*

**10.1 Create the External Credential**

20. Setup → Named Credentials → External Credentials → New.

21. Label: AWS API Gateway. Name: AWS_API_Gateway. Authentication
    Protocol: Custom.

22. Under Principals, add a principal named \'default\' with sequence 1.

23. Save.

**10.2 Create the Named Credential**

24. Setup → Named Credentials → New.

25. Label: AWS Gateway. Name: AWS_Gateway.

26. URL: paste the ApiUrl from your SAM output
    (https://abc123.execute-api.eu-west-1.amazonaws.com/dev).

27. External Credential: AWS API Gateway.

28. Allowed Namespaces: leave blank. Generate Authorization Header:
    unchecked (we\'re not using auth in Phase 3).

29. Save.

**10.3 Grant access via Permission Set**

30. Setup → Permission Sets → New.

31. Label: AWS Gateway Access. Assign to yourself.

32. Under External Credential Principal Access, enable the \'default\'
    principal on AWS API Gateway.

33. Save and assign.

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Setup → Named Credentials → AWS_Gateway shows the URL you configured. |
|                                                                       |
| You can reference it in Apex as callout:AWS_Gateway/enrolments        |
+-----------------------------------------------------------------------+

**STEP 11 ◆ Build the Platform Event Subscriber**

*Goal: create an Apex trigger on Student_Registered\_\_e that posts to
AWS via the Named Credential and updates the Contact with the
integration result.*

**11.1 Create the handler class**

Create force-app/main/default/classes/EnrolmentEventHandler.cls:

+-----------------------------------------------------------------------+
| *EnrolmentEventHandler.cls*                                           |
|                                                                       |
| public without sharing class EnrolmentEventHandler {                  |
|                                                                       |
| public static void handleEvents(List\<Student_Registered\_\_e\>       |
| events) {                                                             |
|                                                                       |
| // Platform Event triggers run as Automated Process User --- no       |
| running user context.                                                 |
|                                                                       |
| // Use Queueable for HTTP callouts to avoid blocking the subscriber.  |
|                                                                       |
| for (Student_Registered\_\_e evt : events) {                          |
|                                                                       |
| System.enqueueJob(new EnrolmentCalloutQueueable(                      |
|                                                                       |
| evt.ContactId\_\_c, evt.CorrelationId\_\_c, evt.PayloadJson\_\_c));   |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**11.2 Create the Queueable**

Create force-app/main/default/classes/EnrolmentCalloutQueueable.cls:

+-----------------------------------------------------------------------+
| *EnrolmentCalloutQueueable.cls*                                       |
|                                                                       |
| public class EnrolmentCalloutQueueable implements Queueable,          |
| Database.AllowsCallouts {                                             |
|                                                                       |
| private String contactId;                                             |
|                                                                       |
| private String correlationId;                                         |
|                                                                       |
| private String payloadJson;                                           |
|                                                                       |
| private Integer attempt;                                              |
|                                                                       |
| public EnrolmentCalloutQueueable(String contactId, String             |
| correlationId, String payload) {                                      |
|                                                                       |
| this(contactId, correlationId, payload, 1);                           |
|                                                                       |
| }                                                                     |
|                                                                       |
| public EnrolmentCalloutQueueable(String contactId, String             |
| correlationId, String payload, Integer attempt) {                     |
|                                                                       |
| this.contactId = contactId;                                           |
|                                                                       |
| this.correlationId = correlationId;                                   |
|                                                                       |
| this.payloadJson = payload;                                           |
|                                                                       |
| this.attempt = attempt;                                               |
|                                                                       |
| }                                                                     |
|                                                                       |
| public void execute(QueueableContext ctx) {                           |
|                                                                       |
| HttpRequest req = new HttpRequest();                                  |
|                                                                       |
| req.setEndpoint(\'callout:AWS_Gateway/enrolments\');                  |
|                                                                       |
| req.setMethod(\'POST\');                                              |
|                                                                       |
| req.setHeader(\'Content-Type\', \'application/json\');                |
|                                                                       |
| req.setHeader(\'Idempotency-Key\', correlationId);                    |
|                                                                       |
| req.setHeader(\'X-Correlation-Id\', correlationId);                   |
|                                                                       |
| req.setBody(payloadJson);                                             |
|                                                                       |
| req.setTimeout(10000);                                                |
|                                                                       |
| Http http = new Http();                                               |
|                                                                       |
| String newStatus;                                                     |
|                                                                       |
| try {                                                                 |
|                                                                       |
| HttpResponse resp = http.send(req);                                   |
|                                                                       |
| Integer code = resp.getStatusCode();                                  |
|                                                                       |
| if (code \>= 200 && code \< 300) {                                    |
|                                                                       |
| newStatus = \'Success\';                                              |
|                                                                       |
| } else if (code \>= 500 && attempt \< 3) {                            |
|                                                                       |
| // Retry with backoff (simplified --- real impl would delay)          |
|                                                                       |
| System.enqueueJob(new EnrolmentCalloutQueueable(                      |
|                                                                       |
| contactId, correlationId, payloadJson, attempt + 1));                 |
|                                                                       |
| newStatus = \'Retrying\';                                             |
|                                                                       |
| } else {                                                              |
|                                                                       |
| newStatus = \'Failed\';                                               |
|                                                                       |
| }                                                                     |
|                                                                       |
| } catch (Exception e) {                                               |
|                                                                       |
| newStatus = (attempt \< 3) ? \'Retrying\' : \'Failed\';               |
|                                                                       |
| if (attempt \< 3) {                                                   |
|                                                                       |
| System.enqueueJob(new EnrolmentCalloutQueueable(                      |
|                                                                       |
| contactId, correlationId, payloadJson, attempt + 1));                 |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| update new Contact(                                                   |
|                                                                       |
| Id = contactId,                                                       |
|                                                                       |
| IntegrationStatus\_\_c = newStatus,                                   |
|                                                                       |
| IntegrationLastSync\_\_c = System.now()                               |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**11.3 Create the trigger**

Create force-app/main/default/triggers/StudentRegisteredTrigger.trigger:

+-----------------------------------------------------------------------+
| *StudentRegisteredTrigger.trigger*                                    |
|                                                                       |
| trigger StudentRegisteredTrigger on Student_Registered\_\_e (after    |
| insert) {                                                             |
|                                                                       |
| EnrolmentEventHandler.handleEvents(Trigger.new);                      |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**11.4 Add test coverage**

Create EnrolmentCalloutQueueableTest.cls with an HttpCalloutMock
covering success and failure paths. Aim for ≥85% on the new classes.

**11.5 Deploy**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| sf project deploy start \--source-dir force-app/main/default/classes  |
|                                                                       |
| sf project deploy start \--source-dir force-app/main/default/triggers |
|                                                                       |
| sf apex run test \--class-names EnrolmentCalloutQueueableTest         |
| \--result-format human \--code-coverage                               |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Tests pass with ≥85% coverage.                                        |
|                                                                       |
| Commit: git add . && git commit -m \'feat(sf): add PE subscriber +    |
| queueable callout to AWS\'                                            |
+-----------------------------------------------------------------------+

**STEP 12 ◆ End-to-End Forward Flow Test**

*Goal: prove the full chain works --- LWC → Apex → Contact → Platform
Event → Queueable → AWS → DynamoDB → status writeback.*

**12.1 Open three windows**

-   Browser tab 1: Your Experience Cloud /register page

-   Browser tab 2: Salesforce setup → Contact list view

-   Terminal: aws logs tail
    /aws/lambda/enrolment-api-dev-CreateEnrolmentFunction \--follow

**12.2 Run the flow**

34. Fill in the registration form with a unique email.

35. Submit.

36. Observe the success toast with a correlation ID --- copy it.

37. In the Contact list view, find the new Contact.
    IntegrationStatus\_\_c should briefly be Pending, then change to
    Success within a few seconds.

38. In the terminal, see the Lambda invocation logs with the matching
    correlation ID.

39. Query DynamoDB and find the idempotency record with that ID.

+-----------------------------------------------------------------------+
| **✓ VERIFY Phase 3 complete --- this is the headline demo moment**    |
|                                                                       |
| A real student submission flows from browser through Salesforce,      |
| Platform Events, Queueable callout, Named Credential, API Gateway,    |
| Lambda, DynamoDB, and back to Salesforce as a status update.          |
|                                                                       |
| A single correlation ID stitches the whole story together.            |
|                                                                       |
| Commit: git add . && git commit -m \'feat: end-to-end forward flow    |
| working\'                                                             |
+-----------------------------------------------------------------------+

**Phase 4 --- Reverse Flow & Polish**

By the end of this phase you will have external systems able to update
Contacts in Salesforce via the same AWS gateway, plus the observability
polish that sells the demo.

**STEP 13 ◆ Salesforce Connected App for JWT Bearer**

*Goal: configure a Connected App and upload a certificate so AWS Lambda
can authenticate back into Salesforce.*

**13.1 Generate a key pair**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| \# On your machine                                                    |
|                                                                       |
| openssl req -x509 -sha256 -nodes -days 365 -newkey rsa:2048 \\        |
|                                                                       |
| -keyout server.key -out server.crt \\                                 |
|                                                                       |
| -subj \"/CN=edutechco-integration\"                                   |
+-----------------------------------------------------------------------+

**13.2 Create the Connected App**

40. Setup → App Manager → New Connected App.

41. Name: EduTechCo Integration. Email: your email.

42. Enable OAuth Settings: checked. Callback URL:
    https://login.salesforce.com/services/oauth2/callback (placeholder,
    not used by JWT).

43. Use digital signatures: checked. Upload server.crt.

44. Selected OAuth Scopes: Manage user data via APIs (api), Perform
    requests at any time (refresh_token, offline_access).

45. Save. Copy the Consumer Key --- you will paste it into Secrets
    Manager.

**13.3 Pre-authorize your user**

46. After saving, open the Connected App → Manage → Edit Policies.

47. Permitted Users: Admin approved users are pre-authorized.

48. Save, then go to Manage Profiles and add System Administrator.

**13.4 Populate AWS Secrets Manager**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| \# Get the secret ARN                                                 |
|                                                                       |
| aws cloudformation describe-stacks \--stack-name enrolment-api-dev \\ |
|                                                                       |
| \--query \"Stacks\[0\].Outputs\"                                      |
|                                                                       |
| \# Build the secret payload                                           |
|                                                                       |
| cat \> /tmp/sf-secret.json \<\<EOF                                    |
|                                                                       |
| {                                                                     |
|                                                                       |
| \"privateKey\": \"\$(cat server.key \| sed \'s/\$/\\\\n/\' \| tr -d   |
| \'\\n\')\",                                                           |
|                                                                       |
| \"clientId\": \"\<your-connected-app-consumer-key\>\",                |
|                                                                       |
| \"username\": \"\<your-salesforce-username\>\"                        |
|                                                                       |
| }                                                                     |
|                                                                       |
| EOF                                                                   |
|                                                                       |
| aws secretsmanager put-secret-value \\                                |
|                                                                       |
| \--secret-id enrolment-api-dev-sf-jwt-key \\                          |
|                                                                       |
| \--secret-string file:///tmp/sf-secret.json                           |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Connected App shows \'Admin approved users are pre-authorized\'.      |
|                                                                       |
| Secrets Manager value contains the private key, client ID, and        |
| username.                                                             |
|                                                                       |
| Commit: git add . && git commit -m \'feat(sf): add connected app      |
| metadata\'                                                            |
+-----------------------------------------------------------------------+

**STEP 14 ◆ Write the Update-Enrolment Lambda**

*Goal: implement PATCH /enrolments/{id} --- authenticate to Salesforce
via JWT Bearer and update the Contact record.*

**14.1 Create the handler**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| mkdir -p aws-sam/src/update-enrolment                                 |
|                                                                       |
| cd aws-sam/src/update-enrolment                                       |
|                                                                       |
| npm init -y                                                           |
|                                                                       |
| npm install \@aws-sdk/client-secrets-manager jsonwebtoken             |
+-----------------------------------------------------------------------+

Create aws-sam/src/update-enrolment/index.js:

+-----------------------------------------------------------------------+
| *aws-sam/src/update-enrolment/index.js*                               |
|                                                                       |
| const { SecretsManagerClient, GetSecretValueCommand } =               |
| require(\'@aws-sdk/client-secrets-manager\');                         |
|                                                                       |
| const jwt = require(\'jsonwebtoken\');                                |
|                                                                       |
| const sm = new SecretsManagerClient({});                              |
|                                                                       |
| let cachedSecret = null;                                              |
|                                                                       |
| exports.handler = async (event) =\> {                                 |
|                                                                       |
| const correlationId = event.headers?.\[\'X-Correlation-Id\'\]         |
|                                                                       |
| \|\| event.headers?.\[\'x-correlation-id\'\] \|\| generateId();       |
|                                                                       |
| const contactId = event.pathParameters?.id;                           |
|                                                                       |
| log(\'info\', \'patch received\', { correlationId, contactId });      |
|                                                                       |
| let body;                                                             |
|                                                                       |
| try { body = JSON.parse(event.body \|\| \'{}\'); }                    |
|                                                                       |
| catch (e) { return problem(400, \'invalid-json\', \'Body is not valid |
| JSON\', correlationId); }                                             |
|                                                                       |
| try {                                                                 |
|                                                                       |
| const { access_token, instance_url } = await getSalesforceToken();    |
|                                                                       |
| // Map API fields to Contact fields                                   |
|                                                                       |
| const sfBody = {                                                      |
|                                                                       |
| IntegrationStatus\_\_c: body.status === \'accepted\' ? \'Success\'    |
|                                                                       |
| : body.status === \'rejected\' ? \'Failed\' : \'Pending\',            |
|                                                                       |
| IntegrationLastSync\_\_c: new Date().toISOString()                    |
|                                                                       |
| };                                                                    |
|                                                                       |
| const res = await                                                     |
| fetch(\`\                                                             |
| ${instance_url}/services/data/v60.0/sobjects/Contact/\${contactId}\`, |
| {                                                                     |
|                                                                       |
| method: \'PATCH\',                                                    |
|                                                                       |
| headers: {                                                            |
|                                                                       |
| \'Authorization\': \`Bearer \${access_token}\`,                       |
|                                                                       |
| \'Content-Type\': \'application/json\'                                |
|                                                                       |
| },                                                                    |
|                                                                       |
| body: JSON.stringify(sfBody)                                          |
|                                                                       |
| });                                                                   |
|                                                                       |
| if (!res.ok) {                                                        |
|                                                                       |
| const text = await res.text();                                        |
|                                                                       |
| log(\'error\', \'sf patch failed\', { correlationId, status:          |
| res.status, text });                                                  |
|                                                                       |
| return problem(502, \'salesforce-update-failed\', text,               |
| correlationId);                                                       |
|                                                                       |
| }                                                                     |
|                                                                       |
| log(\'info\', \'updated\', { correlationId, contactId });             |
|                                                                       |
| return {                                                              |
|                                                                       |
| statusCode: 200,                                                      |
|                                                                       |
| headers: { \'Content-Type\': \'application/json\',                    |
| \'X-Correlation-Id\': correlationId },                                |
|                                                                       |
| body: JSON.stringify({ id: contactId, \...body, updatedAt: new        |
| Date().toISOString() })                                               |
|                                                                       |
| };                                                                    |
|                                                                       |
| } catch (e) {                                                         |
|                                                                       |
| log(\'error\', \'handler failed\', { correlationId, error: e.message  |
| });                                                                   |
|                                                                       |
| return problem(500, \'internal-error\', e.message, correlationId);    |
|                                                                       |
| }                                                                     |
|                                                                       |
| };                                                                    |
|                                                                       |
| async function getSalesforceToken() {                                 |
|                                                                       |
| if (!cachedSecret) {                                                  |
|                                                                       |
| const resp = await sm.send(new GetSecretValueCommand({ SecretId:      |
| process.env.SF_JWT_SECRET_ARN }));                                    |
|                                                                       |
| cachedSecret = JSON.parse(resp.SecretString);                         |
|                                                                       |
| }                                                                     |
|                                                                       |
| const { privateKey, clientId, username } = cachedSecret;              |
|                                                                       |
| const cleanKey = privateKey.replace(/\\\\n/g, \'\\n\');               |
|                                                                       |
| const assertion = jwt.sign({                                          |
|                                                                       |
| iss: clientId,                                                        |
|                                                                       |
| sub: username,                                                        |
|                                                                       |
| aud: \'https://login.salesforce.com\',                                |
|                                                                       |
| exp: Math.floor(Date.now() / 1000) + 180                              |
|                                                                       |
| }, cleanKey, { algorithm: \'RS256\' });                               |
|                                                                       |
| const tokenRes = await                                                |
| fetch(\'https://login.salesforce.com/services/oauth2/token\', {       |
|                                                                       |
| method: \'POST\',                                                     |
|                                                                       |
| headers: { \'Content-Type\': \'application/x-www-form-urlencoded\' }, |
|                                                                       |
| body: new URLSearchParams({                                           |
|                                                                       |
| grant_type: \'urn:ietf:params:oauth:grant-type:jwt-bearer\',          |
|                                                                       |
| assertion                                                             |
|                                                                       |
| })                                                                    |
|                                                                       |
| });                                                                   |
|                                                                       |
| if (!tokenRes.ok) {                                                   |
|                                                                       |
| throw new Error(\`JWT auth failed: \${await tokenRes.text()}\`);      |
|                                                                       |
| }                                                                     |
|                                                                       |
| return await tokenRes.json();                                         |
|                                                                       |
| }                                                                     |
|                                                                       |
| function problem(status, type, detail, correlationId) {               |
|                                                                       |
| return {                                                              |
|                                                                       |
| statusCode: status,                                                   |
|                                                                       |
| headers: { \'Content-Type\': \'application/problem+json\',            |
| \'X-Correlation-Id\': correlationId },                                |
|                                                                       |
| body: JSON.stringify({ type, title: type, status, detail,             |
| correlationId })                                                      |
|                                                                       |
| };                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| function log(level, msg, fields) {                                    |
|                                                                       |
| console.log(JSON.stringify({ level, msg, \...fields, timestamp: new   |
| Date().toISOString() }));                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| function generateId() {                                               |
|                                                                       |
| return \'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx\'.replace(/\[xy\]/g, c  |
| =\> {                                                                 |
|                                                                       |
| const r = Math.random() \* 16 \| 0;                                   |
|                                                                       |
| return (c === \'x\' ? r : (r & 0x3 \| 0x8)).toString(16);             |
|                                                                       |
| });                                                                   |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**14.2 Redeploy**

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| cd aws-sam                                                            |
|                                                                       |
| sam build && sam deploy                                               |
+-----------------------------------------------------------------------+

**14.3 Test the reverse flow**

In Postman:

-   **Method:** PATCH

-   **URL:** \<api-url\>/enrolments/\<a-real-contact-id-from-your-org\>

-   **Headers:** Content-Type: application/json; X-Correlation-Id:
    \<uuid\>

Body:

+-----------------------------------------------------------------------+
| *body*                                                                |
|                                                                       |
| { \"status\": \"accepted\" }                                          |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **✓ VERIFY Verification**                                             |
|                                                                       |
| Postman returns 200.                                                  |
|                                                                       |
| In Salesforce, the Contact\'s IntegrationStatus\_\_c is updated to    |
| Success.                                                              |
|                                                                       |
| CloudWatch logs show the JWT token exchange and the Salesforce PATCH  |
| call.                                                                 |
|                                                                       |
| Commit: git add . && git commit -m \'feat(aws): add update-enrolment  |
| lambda with jwt bearer auth\'                                         |
+-----------------------------------------------------------------------+

**STEP 15 ◆ Observability Polish & Demo Prep**

*Goal: make sure the demo tells a clean story --- saved queries,
dashboards, and a Postman collection ready to go.*

**15.1 Save a CloudWatch Logs Insights query**

In CloudWatch → Logs Insights, select both Lambda log groups and save
this query as \'Trace by correlation ID\':

+-----------------------------------------------------------------------+
| *Logs Insights*                                                       |
|                                                                       |
| fields \@timestamp, level, msg, correlationId, contactId, enrolmentId |
|                                                                       |
| \| filter correlationId = \"PASTE_HERE\"                              |
|                                                                       |
| \| sort \@timestamp asc                                               |
+-----------------------------------------------------------------------+

**15.2 Build the Postman collection**

-   Collection name: EduTechCo Enrolment API

-   Request 1: POST Create Enrolment (with example body, Idempotency-Key
    as a {{uuid}} variable)

-   Request 2: POST Replay Same Enrolment (same Idempotency-Key
    hard-coded --- proves caching)

-   Request 3: PATCH Update Enrolment (reverse flow)

-   Export the collection JSON and commit it to
    docs/postman-collection.json

**15.3 Bookmark tabs for the demo**

-   Experience Cloud /register page

-   Salesforce Contact list view sorted by Created Date desc

-   Swagger Editor rendering the OpenAPI YAML

-   CloudWatch Logs Insights with the saved query

-   DynamoDB table console view

-   This runbook and the SDD

**15.4 Rehearse the Loom**

Follow the minute-by-minute demo script in Section 16 of the SDD. Record
the Loom, review it, re-record if needed. Target 12--14 minutes ---
under the 15-minute limit gives you breathing room for a clean intro and
close.

+-----------------------------------------------------------------------+
| **✓ VERIFY Phase 4 complete --- you are demo-ready**                  |
|                                                                       |
| Forward flow: LWC → Salesforce → AWS, fully traceable by correlation  |
| ID                                                                    |
|                                                                       |
| Reverse flow: AWS → Salesforce via JWT Bearer, live record update     |
|                                                                       |
| OpenAPI spec drives the API Gateway configuration                     |
|                                                                       |
| Postman collection and CloudWatch queries ready for the walkthrough   |
|                                                                       |
| Final commit: git add . && git commit -m \'docs: demo assets +        |
| observability queries\'                                               |
|                                                                       |
| Tag the release: git tag v1.0-demo && git push \--tags                |
+-----------------------------------------------------------------------+

**Teardown (After the Demo)**

After you\'ve recorded the Loom and submitted the assignment, tear down
the AWS resources to avoid any surprise charges.

+-----------------------------------------------------------------------+
| *terminal*                                                            |
|                                                                       |
| cd aws-sam                                                            |
|                                                                       |
| sam delete \--stack-name enrolment-api-dev                            |
|                                                                       |
| \# Confirm the DynamoDB table and Secrets Manager secret are deleted  |
| in the console                                                        |
|                                                                       |
| \# (Secrets Manager keeps a 7-day recovery window by default)         |
+-----------------------------------------------------------------------+

Salesforce Developer Edition orgs can be kept indefinitely at no cost.
You can leave everything in place as a portfolio piece.

**Appendix --- Quick Reference**

**Command Cheat Sheet**

  -----------------------------------------------------------------------
  **Task**                 **Command**
  ------------------------ ----------------------------------------------
  Deploy Salesforce        sf project deploy start \--source-dir
  metadata                 force-app

  Run Apex tests with      sf apex run test \--result-format human
  coverage                 \--code-coverage

  Tail Lambda logs         aws logs tail /aws/lambda/\<function-name\>
                           \--follow

  Deploy SAM stack         cd aws-sam && sam build && sam deploy

  Scan DynamoDB            aws dynamodb scan \--table-name \<table\>

  Validate OpenAPI         npx \@redocly/cli lint
                           openapi/student-enrolment-api.yaml

  Delete SAM stack         sam delete \--stack-name enrolment-api-dev
  -----------------------------------------------------------------------

**Troubleshooting**

  -----------------------------------------------------------------------
  **Symptom**            **Likely cause**         **Fix**
  ---------------------- ------------------------ -----------------------
  Apex callout returns   Named Credential not     Setup → Named
  \'Unauthorized         created or URL missing   Credentials → verify
  endpoint\'                                      URL

  LWC cannot find Apex   Missing \@AuraEnabled or Check annotation +
  method                 Guest User lacks Apex    Guest User profile
                         Class Access             

  SAM deploy fails on    Path in DefinitionBody   Relative to aws-sam/
  OpenAPI import         is wrong                 folder --- use
                                                  ../openapi/\...

  JWT auth fails         User not pre-authorized  App Manager → Manage →
  (invalid_grant)        on Connected App         Profiles → add your
                                                  profile

  DynamoDB scan empty    Wrong table name in env  Check CloudWatch logs
  after successful POST  var                      for the table name used

  Platform Event         Missing trigger or       Deploy the trigger;
  subscriber not firing  inactive trigger         check Setup → Apex
                                                  Triggers
  -----------------------------------------------------------------------
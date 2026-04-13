public with sharing class RegistrationController {

    public class RegistrationRequest {
        // Personal information
        @AuraEnabled public String  firstName;
        @AuraEnabled public String  middleName;
        @AuraEnabled public String  lastName;
        @AuraEnabled public String  email;
        @AuraEnabled public Date    dateOfBirth;
        @AuraEnabled public String  sex;
        @AuraEnabled public String  cityOfResidence;
        @AuraEnabled public String  countryOfResidence;
        @AuraEnabled public String  nationality;
        @AuraEnabled public String  phone;
        @AuraEnabled public String  isWhatsApp;

        // Academic information
        @AuraEnabled public String highSchoolCountry;
        @AuraEnabled public String highSchool;
        @AuraEnabled public String highSchoolCity;
        @AuraEnabled public String highSchoolName;

        // ALU information
        @AuraEnabled public String  preferredIntake;
        @AuraEnabled public String  preferredProgram;
        @AuraEnabled public String  howDidYouHearAboutUs;

        // Consent & agreements — typed as String to safely handle any JS serialised value
        @AuraEnabled public String consentGiven;
        @AuraEnabled public String feeStructureAcknowledged;
        @AuraEnabled public String privacyPolicyAgreed;
        @AuraEnabled public String marketingOptIn;

        // Helper — safe boolean conversion regardless of what JS sends
        public Boolean boolVal(String s) {
            return s == 'true' || s == 'True' || s == '1';
        }
    }

    public class RegistrationResponse {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String  contactId;
        @AuraEnabled public String  correlationId;
        @AuraEnabled public String  message;
    }

    @AuraEnabled
    public static RegistrationResponse registerStudent(RegistrationRequest req) {
        RegistrationResponse res = new RegistrationResponse();
        String correlationId = generateUuid();

        Savepoint sp = Database.setSavepoint();

        try {
            // --- Create Contact ---
            Contact ct = new Contact(
                FirstName                     = req.firstName,
                Middle_Name__c                = req.middleName,
                LastName                      = req.lastName,
                Email                         = req.email,
                Birthdate                     = req.dateOfBirth,
                Sex__c                        = req.sex,
                City_of_Residence__c          = req.cityOfResidence,
                Country_of_Residence__c       = req.countryOfResidence,
                Nationality__c                = req.nationality,
                Phone                         = req.phone,
                Is_WhatsApp_Number__c         = req.boolVal(req.isWhatsApp),
                High_School_Country__c        = req.highSchoolCountry,
                High_School__c                = req.highSchool,
                High_School_City__c           = req.highSchoolCity,
                High_School_Name__c           = req.highSchoolName,
                Preferred_Intake__c           = req.preferredIntake,
                Preferred_Program__c          = req.preferredProgram,
                How_Did_You_Hear_About_Us__c  = req.howDidYouHearAboutUs,
                CorrelationId__c              = correlationId,
                IntegrationStatus__c          = 'Pending',
                ConsentGiven__c               = req.boolVal(req.consentGiven),
                ConsentTimestamp__c           = System.now(),
                Fee_Structure_Acknowledged__c = req.boolVal(req.feeStructureAcknowledged),
                Privacy_Policy_Agreed__c      = req.boolVal(req.privacyPolicyAgreed),
                Opt_In_ALU_News__c            = req.boolVal(req.marketingOptIn),
                Opt_Out_ALU_News__c           = !req.boolVal(req.marketingOptIn)
            );
            insert ct;

            // --- Publish Platform Event ---
            Student_Registered__e evt = new Student_Registered__e(
                CorrelationId__c  = correlationId,
                ContactId__c      = ct.Id,
                Email__c          = req.email,
                PayloadJson__c    = JSON.serialize(req),
                EventTimestamp__c = System.now()
            );

            Database.SaveResult sr = EventBus.publish(evt);

            if (!sr.isSuccess()) {
                throw new AuraHandledException('Failed to publish registration event');
            }

            res.success       = true;
            res.contactId     = ct.Id;
            res.correlationId = correlationId;
            res.message       = 'Registration successful';
            return res;

        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Registration failed: ' + e.getMessage());
        }
    }

    private static String generateUuid() {
        Blob b   = Crypto.generateAesKey(128);
        String h = EncodingUtil.convertToHex(b);
        return h.substring(0, 8)  + '-' + h.substring(8, 12)  + '-4' +
               h.substring(13, 16) + '-a' + h.substring(17, 20) + '-' +
               h.substring(20, 32);
    }
}
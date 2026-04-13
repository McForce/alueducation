public without sharing class EnrolmentEventHandler {
 
    public static void handleEvents(List<Student_Registered__e> events) {
        // Platform Event triggers run as Automated Process User — no running user context.
        // Use Queueable for HTTP callouts to avoid blocking the subscriber.
        for (Student_Registered__e evt : events) {
            System.enqueueJob(new EnrolmentCalloutQueueable(
                evt.ContactId__c, evt.CorrelationId__c, evt.PayloadJson__c));
        }
    }
}
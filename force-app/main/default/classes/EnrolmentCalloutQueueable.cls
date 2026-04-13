public class EnrolmentCalloutQueueable implements Queueable, Database.AllowsCallouts {
 
    private String contactId;
    private String correlationId;
    private String payloadJson;
    private Integer attempt;
 
    public EnrolmentCalloutQueueable(String contactId, String correlationId, String payload) {
        this(contactId, correlationId, payload, 1);
    }
 
    public EnrolmentCalloutQueueable(String contactId, String correlationId, String payload, Integer attempt) {
        this.contactId = contactId;
        this.correlationId = correlationId;
        this.payloadJson = payload;
        this.attempt = attempt;
    }
 
    public void execute(QueueableContext ctx) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:AWS_Gateway/enrolments');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Idempotency-Key', correlationId);
        req.setHeader('X-Correlation-Id', correlationId);
        req.setBody(payloadJson);
        req.setTimeout(10000);
 
        Http http = new Http();
        String newStatus;
        try {
            HttpResponse resp = http.send(req);
            Integer code = resp.getStatusCode();
            if (code >= 200 && code < 300) {
                newStatus = 'Success';
            } else if (code >= 500 && attempt < 3) {
                // Retry with backoff (simplified — real impl would delay)
                System.enqueueJob(new EnrolmentCalloutQueueable(
                    contactId, correlationId, payloadJson, attempt + 1));
                newStatus = 'Retrying';
            } else {
                newStatus = 'Failed';
            }
        } catch (Exception e) {
            newStatus = (attempt < 3) ? 'Retrying' : 'Failed';
            if (attempt < 3) {
                System.enqueueJob(new EnrolmentCalloutQueueable(
                    contactId, correlationId, payloadJson, attempt + 1));
            }
        }
 
        update new Contact(
            Id = contactId,
            IntegrationStatus__c = newStatus,
            IntegrationLastSync__c = System.now()
        );
    }
}
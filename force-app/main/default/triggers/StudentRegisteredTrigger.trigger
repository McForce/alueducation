trigger StudentRegisteredTrigger on Student_Registered__e (after insert) {
    EnrolmentEventHandler.handleEvents(Trigger.new);
}

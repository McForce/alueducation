import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import registerStudent from '@salesforce/apex/RegistrationController.registerStudent';

export default class RegistrationForm extends LightningElement {

    @track form = {};
    @track isSubmitting = false;
    @track success = false;
    @track correlationId;
    @track showHighSchoolFields = false;

    // ── Picklist options ────────────────────────────────────────────────

    yesNoOptions = [
        { label: 'Yes', value: 'true' },
        { label: 'No',  value: 'false' }
    ];

    marketingOptions = [
        { label: "Yes, I want to receive ALU's latest news and offers.",          value: 'true' },
        { label: "No, I do not want to benefit from ALU's latest news and offers.", value: 'false' }
    ];

    sexOptions = [
        { label: 'Male',              value: 'Male' },
        { label: 'Female',            value: 'Female' },
        { label: 'Prefer not to say', value: 'Prefer not to say' }
    ];

    // Trimmed — populate with full ISO country list in real build
    countryOptions = [
        { label: 'Rwanda',       value: 'Rwanda' },
        { label: 'South Africa', value: 'South Africa' },
        { label: 'Kenya',        value: 'Kenya' },
        { label: 'Nigeria',      value: 'Nigeria' },
        { label: 'Ghana',        value: 'Ghana' }
    ];

    highSchoolOptions = [
        { label: 'Not Listed',           value: 'Not Listed' },
        { label: 'Green Hills Academy',  value: 'Green Hills Academy' },
        { label: 'Lycée de Kigali',      value: 'Lycée de Kigali' },
        { label: 'Saint Andrew\'s',      value: 'Saint Andrew\'s' }
    ];

    intakeOptions = [
        { label: 'January 2026', value: 'January 2026' },
        { label: 'September 2026', value: 'September 2026' }
    ];

    programmeOptions = [
        { label: 'BSc (Hons) Entrepreneurship Leadership',   value: 'BSc (Hons) Entrepreneurship Leadership' },
        { label: 'BSc (Hons) International Business and Trade', value: 'BSc (Hons) International Business and Trade' },
        { label: 'BSc (Hons) Software Engineering',          value: 'BSc (Hons) Software Engineering' }
    ];

    hearAboutUsOptions = [
        { label: 'Social Media',        value: 'Social Media' },
        { label: 'Friend or Family',    value: 'Friend or Family' },
        { label: 'School Counsellor',   value: 'School Counsellor' },
        { label: 'ALU Event',           value: 'ALU Event' },
        { label: 'Online Search',       value: 'Online Search' },
        { label: 'Other',               value: 'Other' }
    ];

    // ── Event handlers ──────────────────────────────────────────────────

    handleChange(event) {
        const field = event.currentTarget.dataset.field;
        // event.detail.checked is only present for checkbox inputs
        const value = (event.detail.checked !== undefined)
            ? String(event.detail.checked)
            : event.detail.value;
        this.form = { ...this.form, [field]: value };
    }

    handleHighSchoolChange(event) {
        const selected = event.currentTarget.value;
        this.showHighSchoolFields = selected === 'Not Listed';
        this.form = { ...this.form, highSchool: selected };
        if (!this.showHighSchoolFields) {
            this.form = { ...this.form, highSchoolCity: null, highSchoolName: null };
        }
    }

    async handleSubmit() {
        const allValid = [
            ...this.template.querySelectorAll('lightning-input, lightning-combobox, lightning-radio-group')
        ].reduce((valid, field) => {
            field.reportValidity();
            return valid && field.checkValidity();
        }, true);

        if (!allValid) return;

        this.isSubmitting = true;

        try {
            const res = await registerStudent({ req: this.form });
            this.success = true;
            this.correlationId = res.correlationId;
            this.dispatchEvent(new ShowToastEvent({
                title:   'Registration successful',
                message: `Reference: ${res.correlationId}`,
                variant: 'success'
            }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title:   'Registration failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        } finally {
            this.isSubmitting = false;
        }
    }

}

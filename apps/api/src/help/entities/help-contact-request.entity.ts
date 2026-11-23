import { Column, Entity, PrimaryColumn } from "typeorm";

/** A "Contact a person" message from the Ask box. Kept only so the help team can reply (learner consent required). */
@Entity("help_contact_requests")
export class HelpContactRequestEntity {
  @PrimaryColumn()
  reference!: string;

  @Column({ type: "varchar", nullable: true })
  name!: string | null;

  @Column()
  contactKind!: string;

  @Column()
  contact!: string;

  @Column({ type: "text" })
  message!: string;

  @Column()
  lang!: string;

  @Column()
  consentGivenAt!: string;

  @Column()
  receivedAt!: string;

  /** "new" until a person on the help team has replied. */
  @Column({ default: "new" })
  status!: string;
}

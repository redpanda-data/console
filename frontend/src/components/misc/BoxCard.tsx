import React from 'react';
import styles from './BoxCard.module.scss';

export interface BoxCardProps {
    id?: string;
    borderStyle?: 'solid' | 'dashed';
    borderWidth?: 'thin' | 'medium';
    hoverable?: boolean;
    active?: boolean;
    children?: React.ReactNode;
}

export default function BoxCard({ id = undefined, borderStyle = 'solid', borderWidth = 'thin', hoverable = true, active = false, children }: BoxCardProps) {
    const classes = [styles.boxCard];

    borderStyle === 'dashed' && classes.push(styles.dashed);
    borderWidth === 'medium' && classes.push(styles.medium);
    hoverable && classes.push(styles.hoverable)
    active && classes.push(styles.active)

    return <div className={classes.join(' ')} id={id}>
        {children}
    </div>;
}

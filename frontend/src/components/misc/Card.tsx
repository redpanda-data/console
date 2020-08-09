import React, { ReactNode, Component, CSSProperties } from "react";


class Card extends Component<{ style?: CSSProperties, className?: string }> {

    render() {
        return <div className={'kowlCard ' + this.props.className} style={this.props.style}>
            {this.props.children}
        </div>
    }
}

export default Card;

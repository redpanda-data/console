import React, { ReactNode, Component, CSSProperties } from "react";


class Card extends Component<{ id?: string, style?: CSSProperties, className?: string }> {

    render() {
        return <div id={this.props.id} className={'kowlCard ' + (this.props.className ?? '')} style={this.props.style}>
            {this.props.children}
        </div>
    }
}

export default Card;
